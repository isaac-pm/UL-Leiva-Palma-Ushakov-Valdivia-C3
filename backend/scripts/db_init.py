"""
Author: geralm
Architecture: Staging Table Ingestion (COPY TEXT -> INSERT SELECT CAST).
This script provides maximum performance while ensuring strict model correctness.
"""

import os
import re
import io
import json
import uuid
import logging
from typing import Type, Set, List, Dict

import polars as pl
from sqlalchemy import text, inspect
from sqlmodel import Session, SQLModel, select

from core.database import get_engine
from core.models import (
    Buildings, Participants, Apartments, Employers, Pubs, 
    Restaurants, Schools, Jobs, CheckinJournal, FinancialJournal, 
    SocialNetwork, TravelJournal, ActivityLogs
)

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("db_init")

engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")
BATCH_SIZE = 150_000 # Memory-safe batch size for streaming
ACTIVITY_LOGS_PATH = os.path.join(DATA_ROOT, "Activity Logs")

INGESTION_PLAN = [
    (os.path.join(DATA_ROOT, "Attributes/Buildings.csv"), Buildings),
    (os.path.join(DATA_ROOT, "Attributes/Participants.csv"), Participants),
    (os.path.join(DATA_ROOT, "Attributes/Apartments.csv"), Apartments),
    (os.path.join(DATA_ROOT, "Attributes/Employers.csv"), Employers),
    (os.path.join(DATA_ROOT, "Attributes/Pubs.csv"), Pubs),
    (os.path.join(DATA_ROOT, "Attributes/Restaurants.csv"), Restaurants),
    (os.path.join(DATA_ROOT, "Attributes/Schools.csv"), Schools),
    (os.path.join(DATA_ROOT, "Attributes/Jobs.csv"), Jobs),
    (os.path.join(DATA_ROOT, "Journals/CheckinJournal.csv"), CheckinJournal),
    (os.path.join(DATA_ROOT, "Journals/FinancialJournal.csv"), FinancialJournal),
    (os.path.join(DATA_ROOT, "Journals/SocialNetwork.csv"), SocialNetwork),
    (os.path.join(DATA_ROOT, "Journals/TravelJournal.csv"), TravelJournal),
]

# -----------------------------------------------------------------------------
# Helpers & Metadata Introspection
# -----------------------------------------------------------------------------
def get_column_casts(model: Type[SQLModel]) -> Dict[str, str]:
    """Determines the correct PostgreSQL cast for each column based on the model."""
    casts = {}
    mapper = inspect(model)
    for column in mapper.columns:
        col_type = str(column.type).upper()
        # Map SQLAlchemy types to PG cast types
        if "UUID" in col_type: casts[column.name] = "UUID"
        elif "JSONB" in col_type: casts[column.name] = "JSONB"
        elif "TIMESTAMP" in col_type: casts[column.name] = "TIMESTAMPTZ"
        elif "TIME" in col_type: casts[column.name] = "TIME"
        elif "INTEGER" in col_type: casts[column.name] = "INTEGER"
        elif "FLOAT" in col_type or "NUMERIC" in col_type: casts[column.name] = "DOUBLE PRECISION"
        elif "BOOLEAN" in col_type: casts[column.name] = "BOOLEAN"
        # For ENUMs, use the actual enum name defined in the DB
        elif column.type.__class__.__name__ == "Enum":
            casts[column.name] = column.type.name
    return casts

# -----------------------------------------------------------------------------
# Core Ingestion Engine
# -----------------------------------------------------------------------------
def ingest_via_staging(session: Session, file_path: str, model: Type[SQLModel], file_name: str):
    table_name = model.__tablename__
    cast_map = get_column_casts(model)
    conn = session.connection().connection
    
    # We read the file in batches to ensure O(1) memory usage
    reader = pl.read_csv_batched(file_path, null_values=["N/A", "NA", "null", "", "NULL"])
    
    total_rows = 0
    while (batches := reader.next_batches(1)):
        df = batches[0]
        if df.is_empty(): break
        
        # 1. Clean data in Polars (Vectorized)
        # Fix 'Residental' typo and clean whitespaces/null bytes
        if "buildingType" in df.columns:
            df = df.with_columns(pl.col("buildingType").str.replace("Residental", "Residential"))
        
        str_cols = [c for c, t in df.schema.items() if t == pl.Utf8]
        df = df.with_columns([pl.col(c).str.replace_all("\x00", "").str.strip_chars() for c in str_cols])

        # 2. Add required model fields (UUID, metadata)
        if "id" in model.model_fields and "id" not in df.columns:
            df = df.with_columns(pl.Series("id", [str(uuid.uuid4()) for _ in range(df.height)]))
        if "file_meta" in model.model_fields:
            df = df.with_columns(pl.lit(json.dumps({"filename": file_name})).alias("file_meta"))

        # Keep only columns defined in the model
        valid_cols = [c for c in df.columns if c in model.model_fields]
        df = df.select(valid_cols)
        
        # 3. Use a Staging Table (The key to correctness)
        staging_table = f"temp_stage_{uuid.uuid4().hex[:8]}"
        cols_quoted = [f'"{c}"' for c in df.columns]
        
        with conn.cursor() as cur:
            # Create a TEMP table where everything is TEXT
            cur.execute(f"CREATE TEMP TABLE {staging_table} ({', '.join([f'{c} TEXT' for c in cols_quoted])}) ON COMMIT DROP")
            
            # COPY to the staging table (This never fails because it's all TEXT)
            buf = io.BytesIO()
            df.write_csv(buf, separator="\t")
            buf.seek(0)
            cur.copy_expert(f"COPY {staging_table} ({', '.join(cols_quoted)}) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', HEADER true)", buf)
            
            # INSERT into the real table with explicit server-side casting
            select_items = []
            for col in df.columns:
                if col in cast_map:
                    # NULLIF handles empty strings to prevent casting errors for numbers/enums
                    select_items.append(f"NULLIF({staging_table}.\"{col}\", '')::{cast_map[col]}")
                else:
                    select_items.append(f"\"{col}\"") # Plain text
            
            cur.execute(f"""
                INSERT INTO "{table_name}" ({', '.join(cols_quoted)})
                SELECT {', '.join(select_items)} FROM {staging_table}
            """)
            cur.execute(f"DROP TABLE {staging_table}")
            
        total_rows += df.height
    
    session.commit()
    logger.info(f"{file_name}: Successfully loaded {total_rows} rows into {table_name}")

# -----------------------------------------------------------------------------
# Orchestration
# -----------------------------------------------------------------------------
def setup_idempotency(session: Session):
    session.execute(text("CREATE TABLE IF NOT EXISTS ingestion_state (filename TEXT PRIMARY KEY)"))
    session.commit()

def get_processed(session: Session) -> Set[str]:
    return {r[0] for r in session.execute(text("SELECT filename FROM ingestion_state"))}

def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        setup_idempotency(session)
        processed = get_processed(session)

        # 1. Attributes and Journals
        for path, model in INGESTION_PLAN:
            fname = os.path.basename(path)
            if fname not in processed and os.path.exists(path):
                logger.info(f"Starting ingestion: {fname}")
                try:
                    ingest_via_staging(session, path, model, fname)
                    session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f)"), {"f": fname})
                    session.commit()
                except Exception as e:
                    session.rollback()
                    logger.error(f"Failed to ingest {fname}: {e}")

        # 2. Activity Logs (The massive part)
        if os.path.exists(ACTIVITY_LOGS_PATH):
            log_files = sorted([f for f in os.listdir(ACTIVITY_LOGS_PATH) if f.endswith(".csv")], 
                               key=lambda x: int(re.search(r"\d+", x).group() if re.search(r"\d+", x) else 0))
            for fname in log_files:
                if fname not in processed:
                    path = os.path.join(ACTIVITY_LOGS_PATH, fname)
                    try:
                        ingest_via_staging(session, path, ActivityLogs, fname)
                        session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f)"), {"f": fname})
                        session.commit()
                    except Exception as e:
                        session.rollback()
                        logger.error(f"Failed to ingest activity log {fname}: {e}")

if __name__ == "__main__":
    init_db()