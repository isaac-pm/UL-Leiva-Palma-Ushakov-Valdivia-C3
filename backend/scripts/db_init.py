"""
Author: geralm
Final Version: Fixed Type-Casting Logic (Strict Class Matching).
Architecture: Staging Table (COPY TEXT -> INSERT SELECT CAST).
"""

import os, re, io, json, uuid, logging
from typing import Type, Set, Dict
import polars as pl
import sqlalchemy as sa
from sqlalchemy import text, inspect
from sqlmodel import Session, SQLModel, select

from core.database import get_engine
from core.models import (
    Buildings, Participants, Apartments, Employers, Pubs, 
    Restaurants, Schools, Jobs, CheckinJournal, FinancialJournal, 
    SocialNetwork, TravelJournal, ActivityLogs
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("db_init")

engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")
BATCH_SIZE = 150_000 
ACTIVITY_LOGS_PATH = os.path.join(DATA_ROOT, "Activity Logs")

# -----------------------------------------------------------------------------
# Fixed Type Mapping (Strict Class Detection)
# -----------------------------------------------------------------------------
def get_column_casts(model: Type[SQLModel]) -> Dict[str, str]:
    casts = {}
    mapper = inspect(model)
    for column in mapper.columns:
        ctype = column.type
        # Check specific classes to avoid "TIME" being caught in "DATETIME"
        if isinstance(ctype, sa.DateTime): casts[column.name] = "TIMESTAMPTZ"
        elif isinstance(ctype, sa.Time): casts[column.name] = "TIME"
        elif isinstance(ctype, sa.Integer): casts[column.name] = "INTEGER"
        elif isinstance(ctype, (sa.Float, sa.Numeric)): casts[column.name] = "DOUBLE PRECISION"
        elif isinstance(ctype, sa.Boolean): casts[column.name] = "BOOLEAN"
        elif "JSONB" in str(ctype).upper(): casts[column.name] = "JSONB"
        elif "UUID" in str(ctype).upper(): casts[column.name] = "UUID"
        elif hasattr(ctype, "name") and isinstance(ctype, sa.Enum):
            casts[column.name] = ctype.name
    return casts

# -----------------------------------------------------------------------------
# Core Engine
# -----------------------------------------------------------------------------
def ingest_via_staging(session: Session, file_path: str, model: Type[SQLModel], file_name: str):
    table_name = model.__tablename__
    cast_map = get_column_casts(model)
    conn = session.connection().connection
    
    reader = pl.read_csv_batched(file_path, null_values=["N/A", "NA", "null", "", "NULL"])
    
    total_rows = 0
    while (batches := reader.next_batches(1)):
        df = batches[0]
        if df.is_empty(): break
        
        # Clean whitespaces and invisible chars (Critical for Enums)
        str_cols = [c for c, t in df.schema.items() if t == pl.Utf8]
        df = df.with_columns([pl.col(c).str.replace_all("\x00", "").str.strip_chars() for c in str_cols])

        if "buildingType" in df.columns:
            df = df.with_columns(pl.col("buildingType").str.replace("Residental", "Residential"))

        if "id" in model.model_fields and "id" not in df.columns:
            df = df.with_columns(pl.Series("id", [str(uuid.uuid4()) for _ in range(df.height)]))
            
        if "file_meta" in model.model_fields:
            df = df.with_columns(pl.lit(json.dumps({"filename": file_name})).alias("file_meta"))

        valid_cols = [c for c in df.columns if c in model.model_fields]
        df = df.select(valid_cols)
        
        staging_table = f"temp_stage_{uuid.uuid4().hex[:8]}"
        cols_quoted = [f'"{c}"' for c in df.columns]
        
        with conn.cursor() as cur:
            cur.execute(f"CREATE TEMP TABLE {staging_table} ({', '.join([f'{c} TEXT' for c in cols_quoted])}) ON COMMIT DROP")
            
            buf = io.BytesIO()
            df.write_csv(buf, separator="\t")
            buf.seek(0)
            cur.copy_expert(f"COPY {staging_table} ({', '.join(cols_quoted)}) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', HEADER true)", buf)
            
            select_items = []
            for col in df.columns:
                if col in cast_map:
                    # NULLIF ensures empty strings become NULL before casting to TIMESTAMP/INT/ENUM
                    select_items.append(f"NULLIF({staging_table}.\"{col}\", '')::{cast_map[col]}")
                else:
                    select_items.append(f"\"{col}\"")
            
            cur.execute(f'INSERT INTO "{table_name}" ({", ".join(cols_quoted)}) SELECT {", ".join(select_items)} FROM {staging_table}')
            cur.execute(f"DROP TABLE {staging_table}")
            
        total_rows += df.height
    
    session.commit()
    logger.info(f"{file_name}: Loaded {total_rows} rows.")

# -----------------------------------------------------------------------------
# Orchestration
# -----------------------------------------------------------------------------
def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.execute(text("CREATE TABLE IF NOT EXISTS ingestion_state (filename TEXT PRIMARY KEY)"))
        session.commit()
        
        processed = {r[0] for r in session.execute(text("SELECT filename FROM ingestion_state"))}

        # 1. Main Attributes
        plan = [
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

        for path, model in plan:
            fname = os.path.basename(path)
            if fname not in processed and os.path.exists(path):
                ingest_via_staging(session, path, model, fname)
                session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f)"), {"f": fname})
                session.commit()

        # 2. Massive Activity Logs
        if os.path.exists(ACTIVITY_LOGS_PATH):
            log_files = sorted([f for f in os.listdir(ACTIVITY_LOGS_PATH) if f.endswith(".csv")], 
                               key=lambda x: int(re.search(r"\d+", x).group() if re.search(r"\d+", x) else 0))
            for fname in log_files:
                if fname not in processed:
                    ingest_via_staging(session, os.path.join(ACTIVITY_LOGS_PATH, fname), ActivityLogs, fname)
                    session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f)"), {"f": fname})
                    session.commit()

if __name__ == "__main__":
    init_db()