"""
Author: geralm
Ultra-Optimized DB Init for High-Performance Bulk Ingestion (PostgreSQL + Polars + COPY)
"""

import os
import re
import io
import json
import logging
from typing import Type, Set

import polars as pl
from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

from core.database import get_engine
from core.models import (
    Buildings, Participants, Apartments, Employers, Pubs, Restaurants,
    Schools, Jobs, CheckinJournal, FinancialJournal, SocialNetwork,
    TravelJournal, ActivityLogs
)

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("db_init")

engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")
CSV_SCHEMA_INFERENCE = 10_000
BATCH_SIZE = 20  # crítico

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
# ENUM NORMALIZATION
# -----------------------------------------------------------------------------
ENUM_MAPPINGS = {
    "currentMode": {
        "athome": "AtHome",
        "atwork": "AtWork",
        "transport": "Transport",
        "atrecreation": "AtRecreation",
        "atrestaurant": "AtRestaurant",
    },
    "buildingType": {
        "residental": "Residential",
        "residential": "Residential",
        "commercial": "Commercial",
        "school": "School",
    },
    "educationLevel": {
        "low": "Low",
        "highschoolorcollege": "HighSchoolOrCollege",
        "bachelors": "Bachelors",
        "graduate": "Graduate",
    },
    "interestGroup": {k.lower(): k for k in list("ABCDEFGHIJ")},
    "venueType": {
        "apartment": "Apartment",
        "pub": "Pub",
        "restaurant": "Restaurant",
        "workplace": "Workplace",
    },
    "category": {
        "education": "Education",
        "food": "Food",
        "recreation": "Recreation",
        "rentadjustment": "RentAdjustment",
        "shelter": "Shelter",
        "wage": "Wage",
    },
    "purpose": {
        "comingbackfromrestaurant": "Coming Back From Restaurant",
        "eating": "Eating",
        "goingbacktohome": "Going Back to Home",
        "recreation(socialgathering)": "Recreation (Social Gathering)",
        "work/homecommute": "Work/Home Commute",
    }
}

# -----------------------------------------------------------------------------
# STATE
# -----------------------------------------------------------------------------
def setup_ingestion_state(session: Session):
    session.execute(text("""
        CREATE TABLE IF NOT EXISTS ingestion_state (
            filename TEXT PRIMARY KEY,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    session.commit()

def get_processed_files(session: Session) -> Set[str]:
    try:
        return {row[0] for row in session.execute(text("SELECT filename FROM ingestion_state"))}
    except:
        return set()

def mark_file_processed(session: Session, filename: str):
    session.execute(text("INSERT INTO ingestion_state (filename) VALUES (:f) ON CONFLICT DO NOTHING"), {"f": filename})
    session.commit()

# -----------------------------------------------------------------------------
# TRANSFORM
# -----------------------------------------------------------------------------
def transform_dataframe(df: pl.DataFrame, file_name: str, model: Type[SQLModel]) -> pl.DataFrame:
    df = df.select([c for c in df.columns if c in model.model_fields])
    expr = []

    # Limpieza condicional
    for col, dtype in df.schema.items():
        if dtype == pl.Utf8:
            expr.append(
                pl.when(pl.col(col).str.contains(r'[\x00\r\n\t]'))
                .then(pl.col(col).str.replace_all(r"[\x00]", "").str.strip_chars())
                .otherwise(pl.col(col))
                .alias(col)
            )

    # ENUMs
    for col, mapping in ENUM_MAPPINGS.items():
        if col in df.columns:
            expr.append(
                pl.col(col)
                .cast(pl.Utf8)
                .str.strip_chars()
                .str.replace_all(r"\s+", "")
                .str.to_lowercase()
                .replace(mapping, default=None)
                .alias(col)
            )

    # Datetime
    for col in {"timestamp", "travelStartTime", "travelEndTime", "checkInTime", "checkOutTime"}:
        if col in df.columns:
            expr.append(
                pl.col(col)
                .cast(pl.Utf8)
                .str.strip_chars()
                .str.strptime(pl.Datetime, strict=False)
                .alias(col)
            )

    # JSONB
    for col in {"daysToWork", "units"}:
        if col in df.columns:
            expr.append(
                pl.when(pl.col(col).is_null() | (pl.col(col) == ""))
                .then(pl.lit("[]"))
                .otherwise(
                    pl.col(col).str.replace_all("'", '"').map_elements(lambda x: f"[{x}]")
                ).alias(col)
            )

    # metadata
    if "file_meta" in model.model_fields:
        expr.append(pl.lit(json.dumps({"file": file_name})).alias("file_meta"))

    if expr:
        df = df.with_columns(expr)

    return df

# -----------------------------------------------------------------------------
# COPY ENGINE
# -----------------------------------------------------------------------------
def postgres_copy_stream(session: Session, file_path: str, model: Type[SQLModel], file_name: str):
    conn = session.connection().connection
    table = model.__tablename__

    reader = pl.read_csv_batched(
        file_path,
        infer_schema_length=CSV_SCHEMA_INFERENCE,
        null_values=["", "NA", "null", "NULL"],
        ignore_errors=True
    )

    total = 0

    with conn.cursor() as cursor:
        while True:
            batches = reader.next_batches(BATCH_SIZE)
            if not batches:
                break

            for df in batches:
                if df.is_empty():
                    continue

                df = transform_dataframe(df, file_name, model)

                buffer = io.BytesIO()
                df.write_csv(buffer, separator="\t", include_header=False)
                buffer.seek(0)

                cols = ",".join(f'"{c}"' for c in df.columns)

                sql = f"COPY {table} ({cols}) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')"

                cursor.copy_expert(sql, buffer)
                total += df.height

    session.commit()
    logger.info(f"{file_name}: {total} rows inserted")

# -----------------------------------------------------------------------------
# INGEST
# -----------------------------------------------------------------------------
def bulk_insert(session: Session, path: str, model: Type[SQLModel]):
    if not os.path.exists(path):
        return

    name = os.path.basename(path)
    try:
        postgres_copy_stream(session, path, model, name)
        mark_file_processed(session, name)
    except Exception as e:
        session.rollback()
        logger.error(f"{name} failed: {e}")

# -----------------------------------------------------------------------------
# ACTIVITY LOGS
# -----------------------------------------------------------------------------
def extract_number(f): return int(re.search(r"\d+", f).group())

def ingest_activity_logs(session: Session):
    files = sorted(
        [f for f in os.listdir(ACTIVITY_LOGS_PATH) if f.endswith(".csv")],
        key=extract_number
    )

    done = get_processed_files(session)

    for f in files:
        if f in done:
            continue
        bulk_insert(session, os.path.join(ACTIVITY_LOGS_PATH, f), ActivityLogs)

# -----------------------------------------------------------------------------
# INIT
# -----------------------------------------------------------------------------
def init_db():
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        setup_ingestion_state(session)

        if not session.exec(select(Participants).limit(1)).first():
            for path, model in INGESTION_PLAN:
                bulk_insert(session, path, model)

        ingest_activity_logs(session)

if __name__ == "__main__":
    init_db()