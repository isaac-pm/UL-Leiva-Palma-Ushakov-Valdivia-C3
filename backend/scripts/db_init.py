import os
import logging
from typing import Dict, Any, List, Type
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select, SQLModel, insert
import polars as pl
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
    ActivityLogs
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("database_init")

# Configure DB URL
engine = get_engine()

INGESTION_PLAN = [
    # Level 1: No dependencies
    ("../data/Attributes/Buildings.csv", Buildings),
    ("../data/Attributes/Participants.csv", Participants),
    
    # Level 2: Depends on Buildings
    ("../data/Attributes/Apartments.csv", Apartments),
    ("../data/Attributes/Employers.csv", Employers),
    ("../data/Attributes/Pubs.csv", Pubs),
    ("../data/Attributes/Restaurants.csv", Restaurants),
    ("../data/Attributes/Schools.csv", Schools),
    
    # Level 3: Depends on Employers
    ("../data/Attributes/Jobs.csv", Jobs),
    
    # Level 4: Journals (Depends on Participants & Locations)
    ("../data/Journals/CheckinJournal.csv", CheckinJournal),
    ("../data/Journals/FinancialJournal.csv", FinancialJournal),
    ("../data/Journals/SocialNetwork.csv", SocialNetwork),
    ("../data/Journals/TravelJournal.csv", TravelJournal),
]

def parse_broken_array(val_str: Any) -> List[str]:
    """
    Safely parses broken string arrays from CSV (e.g., "[Monday, Tuesday]")
    into native Python lists without using the unsafe eval() function.
    """
    if not isinstance(val_str, str) or not val_str:
        return []
    
    cleaned = val_str.strip("[]").strip()
    if not cleaned:
        return []
        
    return [item.strip().strip("'\"") for item in cleaned.split(",")]


def bulk_insert_with_polars(session: Session, file_path: str, model: Type[SQLModel]):
    if not os.path.exists(file_path):
        logger.warning(f"File not found. Skipping: {file_path}")
        return

    logger.info(f"Ingesting {file_path} into {model.__tablename__} using Polars...")

    # 1. High-performance CSV parsing & Null standardization
    df = pl.read_csv(
        file_path,
        null_values=["N/A", "NA", "null", "", "NULL"], 
        infer_schema_length=10000,
        ignore_errors=True 
    )

    # 2. Vectorized Typo Correction
    if "buildingType" in df.columns:
        df = df.with_columns(
            pl.col("buildingType").str.replace("Residental", "Residential")
        )

    # 3. Handle broken arrays using the safe parser
    for array_col in ["daysToWork", "units"]:
        if array_col in df.columns:
            df = df.with_columns(
                pl.col(array_col).map_elements(parse_broken_array, return_dtype=pl.List(pl.Utf8))
            )

    # 4. Handle 12-Hour Time Format Parsing (e.g., "7:46:00 AM")
    for time_col in ["startTime", "endTime", "checkInTime", "checkOutTime"]:
        if time_col in df.columns and df[time_col].dtype == pl.Utf8:
            df = df.with_columns(
                pl.col(time_col).str.strptime(pl.Time, "%I:%M:%S %p", strict=False)
            )

    # 5. Extract to native Python dictionaries for SQLAlchemy
    records = df.to_dicts()

    # 6. Chunked execution to prevent RAM overflow during the DB API call
    chunk_size = 15000
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        session.execute(insert(model), chunk)
    
    session.commit()


def is_database_seeded(session: Session) -> bool:
    """Check if foundational data exists to avoid re-seeding."""
    try:
        count = session.exec(select(Participants).limit(1)).first()
        return count is not None
    except Exception:
        return False


def ingest_activity_logs(session: Session, base_dir: str):
    """
    Handles the 18GB multi-file activity log ingestion.
    """
    log_dir = os.path.join(base_dir, "data/Activity Logs")
    if not os.path.exists(log_dir):
        logger.warning("Activity Logs directory missing. Skipping.")
        return

    files = [f for f in os.listdir(log_dir) if f.startswith("ParticipantStatusLogs") and f.endswith(".csv")]
    files.sort(key=lambda x: int(''.join(filter(str.isdigit, x)))) 

    for file_name in files:
        file_path = os.path.join(log_dir, file_name)
        bulk_insert_with_polars(session, file_path, ActivityLogs)


def init_db():
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        if is_database_seeded(session):
            logger.info("Database is already seeded. Bypassing initialization.")
            return

        logger.info("Starting fresh data ingestion...")
        
        # 1. Ingest core attributes and journals
        for file_path, model in INGESTION_PLAN:
            bulk_insert_with_polars(session, file_path, model)
            
        # 2. Ingest the 18GB distributed logs
        print("Starting massive Activity Log ingestion. This will take time.")
        ingest_activity_logs(session, base_dir=".")

# --- MISSING EXECUTION BLOCK ---
if __name__ == "__main__":
    logger.info("Starting Database Initialization Protocol...")
    init_db()
    logger.info("Database Initialization Complete. System Ready.")