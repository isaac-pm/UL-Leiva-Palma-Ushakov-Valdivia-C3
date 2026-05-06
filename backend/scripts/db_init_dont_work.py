import os
import re
import io
import json
import uuid
import logging
from typing import Type, Set, List, Dict

import polars as pl
import sqlalchemy as sa
from sqlalchemy import text, inspect
from sqlmodel import Session, SQLModel, select
from psycopg2.extras import execute_values

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("db_init")

engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")
BATCH_SIZE = 50_000 
ACTIVITY_LOGS_PATH = os.path.join(DATA_ROOT, "Activity Logs")

from core.models.base import (
    Buildings, Participants, Apartments, Employers, Pubs, 
    Restaurants, Schools, Jobs, CheckinJournal, FinancialJournal, 
    SocialNetwork, TravelJournal, ActivityLogs
)

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
# Precision Type Mapping
# -----------------------------------------------------------------------------
def get_cast_types(model: Type[SQLModel]) -> Dict[str, str]:
    casts = {}
    mapper = inspect(model)
    for column in mapper.columns:
        ctype = column.type
        if isinstance(ctype, sa.DateTime): casts[column.name] = "TIMESTAMPTZ"
        elif isinstance(ctype, sa.Time): casts[column.name] = "TIME"
        elif isinstance(ctype, sa.Integer): casts[column.name] = "INTEGER"
        elif isinstance(ctype, (sa.Float, sa.Numeric)): casts[column.name] = "DOUBLE PRECISION"
        elif isinstance(ctype, sa.Boolean): casts[column.name] = "BOOLEAN"
        elif "JSONB" in str(ctype).upper(): casts[column.name] = "JSONB"
        elif "UUID" in str(ctype).upper(): casts[column.name] = "UUID"
        elif isinstance(ctype, sa.Enum): casts[column.name] = ctype.name.lower()
    return casts

# -----------------------------------------------------------------------------
# Vectorized Cleansing (Polars)
# -----------------------------------------------------------------------------
def clean_batch(df: pl.DataFrame, file_name: str, model: Type[SQLModel]) -> pl.DataFrame:
    # 1. Strip everything and kill null bytes
    str_cols = [c for c, t in df.schema.items() if t == pl.Utf8]
    df = df.with_columns([
        pl.col(c).str.replace_all("\x00", "").str.strip_chars().str.strip_chars('"') 
        for c in str_cols
    ])

    # 2. Fix JSONB formatting (The "Monday" fix)
    json_cols = {"daysToWork", "units"}.intersection(df.columns)
    for col in json_cols:
        df = df.with_columns(
            pl.col(col)
            .str.strip_chars("[]")
            .str.split(",")
            .map_elements(lambda x: json.dumps([i.strip().strip("'\"") for i in x if i.strip()]), return_dtype=pl.Utf8)
            .alias(col)
        )

    # 3. Handle model logic
    if "buildingType" in df.columns:
        df = df.with_columns(pl.col("buildingType").str.replace("Residental", "Residential"))
    
    if "id" in model.model_fields and "id" not in df.columns:
        df = df.with_columns(pl.lit(None).cast(pl.Utf8).map_batches(lambda _: pl.Series([str(uuid.uuid4()) for _ in range(df.height)])).alias("id"))
    
    if "file_meta" in model.model_fields:
        df = df.with_columns(pl.lit(json.dumps({"filename": file_name})).alias("file_meta"))

    return df.select([c for c in df.columns if c in model.model_fields])

# -----------------------------------------------------------------------------
# Ingestion Engine (The "Vara" Modification)
# -----------------------------------------------------------------------------
def nuclear_ingest(session: Session, file_path: str, model: Type[SQLModel], file_name: str):
    table_name = model.__tablename__
    cast_map = get_cast_types(model)
    conn = session.connection().connection
    
    # We use Polars to read even the dirtiest CSVs
    reader = pl.read_csv_batched(file_path, null_values=["N/A", "NA", "null", "", "NULL"], ignore_errors=True)
    
    while (batches := reader.next_batches(1)):
        df = batches[0]
        if df.is_empty(): break
        
        df = clean_batch(df, file_name, model)
        
        # We prepare the SQL with explicit CASTs for EVERY column
        columns = df.columns
        placeholders = ", ".join([f"%s::{cast_map[c]}" if c in cast_map else "%s" for c in columns])
        sql = f"INSERT INTO \"{table_name}\" ({', '.join([f'\"{c}\"' for c in columns])}) VALUES %s"
        
        # We transform the batch to a list of Python tuples (perfect for psycopg2)
        data = df.to_numpy().tolist()
        
        with conn.cursor() as cur:
            # execute_values is extremely fast and bypasses text-parsing issues
            execute_values(cur, sql, data, template=f"({placeholders})", page_size=BATCH_SIZE)
        
        session.commit()
    logger.info(f"Loaded: {file_name}")

# -----------------------------------------------------------------------------
# Main Loop
# -----------------------------------------------------------------------------
def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.execute(text("CREATE TABLE IF NOT EXISTS ingestion_state (filename TEXT PRIMARY KEY)"))
        session.commit()
        
        processed = {r[0] for r in session.execute(text("SELECT filename FROM ingestion_state"))}

        # 1. Attributes (Respecting FK Order)
        for path, model in INGESTION_PLAN:
            fname = os.path.basename(path)
            if fname not in processed and os.path.exists(path):
                try:
                    nuclear_ingest(session, path, model, fname)
                    session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f)"), {"f": fname})
                    session.commit()
                except Exception as e:
                    logger.error(f"Failed {fname}: {e}")

        # 2. Activity Logs
        if os.path.exists(ACTIVITY_LOGS_PATH):
            log_files = sorted([f for f in os.listdir(ACTIVITY_LOGS_PATH) if f.endswith(".csv")], 
                               key=lambda x: int(re.search(r"\d+", x).group() if re.search(r"\d+", x) else 0))
            for fname in log_files:
                if fname not in processed:
                    try:
                        nuclear_ingest(session, os.path.join(ACTIVITY_LOGS_PATH, fname), ActivityLogs, fname)
                        session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f)"), {"f": fname})
                        session.commit()
                    except Exception as e:
                        logger.error(f"Failed log {fname}: {e}")

if __name__ == "__main__":
    init_db()