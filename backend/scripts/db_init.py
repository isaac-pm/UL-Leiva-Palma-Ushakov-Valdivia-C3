"""
Author: geralm
Refactored for High-Performance ELT Bulk Ingestion.
Protocol: Polars In-Memory TSV Streaming to PostgreSQL COPY.
"""

import os
import re
import io
import json
import uuid
import logging
from typing import Type, Set

import polars as pl
from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

from core.database import get_engine
from core.models import (
    Buildings,
    Participants,
    Apartments,
    Employers,
    Pubs,
    Restaurants,
    Schools,
    Jobs,
    CheckinJournal,
    FinancialJournal,
    SocialNetwork,
    TravelJournal,
    ActivityLogs,
)

# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_init")

# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")
CSV_SCHEMA_INFERENCE = 10_000

INGESTION_PLAN = [
    (f"{DATA_ROOT}/Attributes/Buildings.csv", Buildings),
    (f"{DATA_ROOT}/Attributes/Participants.csv", Participants),
    (f"{DATA_ROOT}/Attributes/Apartments.csv", Apartments),
    (f"{DATA_ROOT}/Attributes/Employers.csv", Employers),
    (f"{DATA_ROOT}/Attributes/Pubs.csv", Pubs),
    (f"{DATA_ROOT}/Attributes/Restaurants.csv", Restaurants),
    (f"{DATA_ROOT}/Attributes/Schools.csv", Schools),
    (f"{DATA_ROOT}/Attributes/Jobs.csv", Jobs),
    (f"{DATA_ROOT}/Journals/CheckinJournal.csv", CheckinJournal),
    (f"{DATA_ROOT}/Journals/FinancialJournal.csv", FinancialJournal),
    (f"{DATA_ROOT}/Journals/SocialNetwork.csv", SocialNetwork),
    (f"{DATA_ROOT}/Journals/TravelJournal.csv", TravelJournal),
]

ACTIVITY_LOGS_PATH = f"{DATA_ROOT}/Activity Logs"

# -----------------------------------------------------------------------------
# State Management (Idempotency)
# -----------------------------------------------------------------------------
def setup_ingestion_state(session: Session) -> None:
    session.execute(text("""
        CREATE TABLE IF NOT EXISTS ingestion_state (
            filename VARCHAR PRIMARY KEY,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    """))
    session.commit()

def get_processed_files(session: Session) -> Set[str]:
    try:
        result = session.execute(text("SELECT filename FROM ingestion_state"))
        return {row[0] for row in result}
    except Exception as e:
        logger.warning(f"Could not fetch ingestion state: {e}")
        return set()

def mark_file_processed(session: Session, filename: str) -> None:
    session.execute(
        text("INSERT INTO ingestion_state (filename) VALUES (:f) ON CONFLICT DO NOTHING"),
        {"f": filename}
    )
    session.commit()

# -----------------------------------------------------------------------------
# Vectorized Transformations (Zero-Tolerance for Whitespaces)
# -----------------------------------------------------------------------------
def transform_dataframe(df: pl.DataFrame, file_name: str, model: Type[SQLModel]) -> pl.DataFrame:
    valid_columns = [col for col in df.columns if col in model.model_fields]
    df = df.select(valid_columns)

    expressions = []
    string_cols = [col for col, dtype in df.schema.items() if dtype == pl.Utf8]

    # 1. Aggressive String Cleansing
    for col in string_cols:
        # Avoid destroying valid JSON syntax in array columns
        if col not in {"daysToWork", "units"}:
            expressions.append(
                pl.col(col)
                .str.replace_all("\x00", "")
                .str.strip_chars() # Sin argumentos: erradica \r, \n, \t y espacios invisibles
                .str.strip_chars('"\'') # Luego elimina comillas literales rebeldes
                .alias(col)
            )
    
    if expressions:
        df = df.with_columns(expressions)
        expressions = []

    # 2. Enum Corrections
    if "buildingType" in df.columns:
        expressions.append(
            pl.col("buildingType").str.replace("Residental", "Residential")
        )

    # 3. Strict JSONB Array Formatting
    for col in {"daysToWork", "units"}.intersection(df.columns):
        expressions.append(
            pl.when(pl.col(col).is_null() | (pl.col(col) == ""))
              .then(pl.lit("[]"))
              .otherwise(
                  pl.format("[{}]", pl.col(col).str.replace_all("'", '"'))
              ).alias(col)
        )

    # 4. Time Parsing
    for col in {"startTime", "endTime", "checkInTime", "checkOutTime"}.intersection(df.columns):
        if df.schema.get(col) == pl.Utf8:
            expressions.append(
                pl.col(col).str.strptime(pl.Time, "%I:%M:%S %p", strict=False)
            )

    if expressions:
        df = df.with_columns(expressions)

    # 5. JSONB Meta-data & UUID Injection
    if "file_meta" in model.model_fields:
        meta_json_str = json.dumps({"filename": file_name})
        df = df.with_columns(pl.lit(meta_json_str).alias("file_meta"))

    if "id" in model.model_fields and "id" not in df.columns:
        uuids = [str(uuid.uuid4()) for _ in range(df.height)]
        df = df.with_columns(pl.Series("id", uuids))

    return df

# -----------------------------------------------------------------------------
# High-Performance Core Engine (TSV Transit Protocol)
# -----------------------------------------------------------------------------
def postgres_copy_stream(
    session: Session, 
    file_path: str, 
    model: Type[SQLModel], 
    file_name: str
) -> None:
    table_name = model.__tablename__
    connection = session.connection().connection
    
    try:
        reader = pl.read_csv_batched(
            file_path,
            null_values=["N/A", "NA", "null", "", "NULL"],
            infer_schema_length=CSV_SCHEMA_INFERENCE,
            ignore_errors=False
        )
        
        batches = reader.next_batches(1)
        total_inserted = 0
        
        with connection.cursor() as cursor:
            while batches:
                chunk_df = batches[0]
                
                if chunk_df.is_empty():
                    batches = reader.next_batches(1)
                    continue
                    
                chunk_df = transform_dataframe(chunk_df, file_name, model)
                
                # Switch transit to TSV (Tab-Separated) to bypass Postgres CSV escaping rules
                buffer = io.BytesIO()
                chunk_df.write_csv(buffer, separator="\t")
                buffer.seek(0)
                
                quoted_columns = [f'"{col}"' for col in chunk_df.columns]
                
                # Postgres configured to receive TSV format
                copy_sql = f"COPY {table_name} ({','.join(quoted_columns)}) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', HEADER true)"
                
                if hasattr(cursor, 'copy_expert'):
                    cursor.copy_expert(copy_sql, buffer)
                else:
                    with cursor.copy(copy_sql) as copy:
                        copy.write(buffer.read())
                
                total_inserted += chunk_df.height
                batches = reader.next_batches(1)
                
        session.commit()
        logger.info(f"{file_name}: Streaming successful. Inserted {total_inserted} rows via COPY.")
        
    except Exception as exc:
        session.rollback()
        logger.error(f"Critical failure streaming {file_name}. Rollback executed. Error: {exc}")
        raise

def bulk_insert_with_polars(session: Session, file_path: str, model: Type[SQLModel]) -> None:
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        return

    file_name = os.path.basename(file_path)
    logger.info(f"Processing {file_name}")

    try:
        postgres_copy_stream(session, file_path, model, file_name)
        mark_file_processed(session, file_name)
    except Exception:
        logger.error(f"Skipping registration of {file_name} due to failure.")

# -----------------------------------------------------------------------------
# Iteration Protocol
# -----------------------------------------------------------------------------
def extract_number(filename: str) -> int:
    match = re.search(r"\d+", filename)
    return int(match.group()) if match else 0

def ingest_activity_logs(session: Session, resume_from_file: int = 0) -> None:
    if not os.path.exists(ACTIVITY_LOGS_PATH):
        logger.warning(f"Missing directory: {ACTIVITY_LOGS_PATH}")
        return

    files = sorted(
        (f for f in os.listdir(ACTIVITY_LOGS_PATH) if f.startswith("ParticipantStatusLogs") and f.endswith(".csv")),
        key=extract_number
    )

    processed_files = get_processed_files(session)
    if processed_files:
        logger.info(f"Detected {len(processed_files)} activity log files already safely stored.")

    for file_name in files:
        file_number = extract_number(file_name)

        if file_number < resume_from_file:
            continue

        if file_name in processed_files:
            logger.info(f"Skipping {file_name}: Already processed.")
            continue

        file_path = os.path.join(ACTIVITY_LOGS_PATH, file_name)
        bulk_insert_with_polars(session, file_path, ActivityLogs)

# -----------------------------------------------------------------------------
# Initialization
# -----------------------------------------------------------------------------
def init_db() -> None:
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        setup_ingestion_state(session)
        
        already_loaded = session.exec(select(Participants).limit(1)).first()

        if not already_loaded:
            logger.info("Loading core attribute datasets")
            for file_path, model in INGESTION_PLAN:
                bulk_insert_with_polars(session, file_path, model)
        else:
            logger.info("Core datasets detected. Skipping attributes ingestion.")

        logger.info("Starting activity logs ingestion protocol")
        ingest_activity_logs(session, resume_from_file=0)


if __name__ == "__main__":
    init_db()