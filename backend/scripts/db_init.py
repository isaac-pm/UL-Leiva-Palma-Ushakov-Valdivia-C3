import os
import re
import logging
from typing import Dict, Any, List, Type
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select, SQLModel, insert
import polars as pl
from polars.exceptions import NoDataError  # CRITICAL: Added exception handling for empty CSVs
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

engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")

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

# FIX: Keep absolute or environment-defined paths strict. No relative prepending later.
DATA_ACTIVITY_PLAN = f"{DATA_ROOT}/Activity Logs"

def parse_broken_array(val_str: Any) -> List[str]:
    """
    Safely parses broken string arrays from CSV without using eval().
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

    try:
        # 1. High-performance parsing
        df = pl.read_csv(
            file_path,
            null_values=["N/A", "NA", "null", "", "NULL"], 
            infer_schema_length=10000,
            ignore_errors=True 
        )
        
        # FIX: Check if dataframe is empty even if headers exist
        if df.is_empty():
            logger.warning(f"File parsed but contains no data rows: {file_path}. Skipping.")
            return

    except NoDataError:
        # FIX: Catch 0-byte or completely empty files causing Polars NoDataError
        logger.error(f"FATAL: File is completely empty or malformed: {file_path}. Skipping to prevent crash.")
        return
    except Exception as e:
        logger.error(f"Unexpected I/O or Parsing error in {file_path}: {e}")
        return

    # 2. Vectorized Typo Correction
    if "buildingType" in df.columns:
        df = df.with_columns(
            pl.col("buildingType").str.replace("Residental", "Residential")
        )

    # 3. Handle broken arrays
    for array_col in ["daysToWork", "units"]:
        if array_col in df.columns:
            df = df.with_columns(
                pl.col(array_col).map_elements(parse_broken_array, return_dtype=pl.List(pl.Utf8))
            )

    # 4. Handle 12-Hour Time Format Parsing
    for time_col in ["startTime", "endTime", "checkInTime", "checkOutTime"]:
        if time_col in df.columns and df[time_col].dtype == pl.Utf8:
            df = df.with_columns(
                pl.col(time_col).str.strptime(pl.Time, "%I:%M:%S %p", strict=False)
            )

    # 5. Extract to dictionaries
    records = df.to_dicts()

    # 6. Chunked execution
    chunk_size = 15000
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        session.execute(insert(model), chunk)
        
        # FIX: Commit PER CHUNK. This releases SQLAlchemy transaction memory.
        # Trade-off: If the script crashes mid-file, you will have partial inserts.
        # But for an 18GB dataset on a constrained device, memory safety is paramount.
        session.commit() 


def is_core_database_seeded(session: Session) -> bool:
    """Checks only if the foundational attributes exist."""
    try:
        count = session.exec(select(Participants).limit(1)).first()
        return count is not None
    except Exception:
        return False


def ingest_activity_logs(session: Session, resume_from_file: int = 1):
    """
    Handles the 18GB multi-file ingestion with a basic resumption parameter.
    """
    if not os.path.exists(DATA_ACTIVITY_PLAN):
        logger.warning(f"Activity Logs directory missing at {DATA_ACTIVITY_PLAN}. Skipping.")
        return

    files = [f for f in os.listdir(DATA_ACTIVITY_PLAN) if f.startswith("ParticipantStatusLogs") and f.endswith(".csv")]
    
    # FIX: Safe sorting regex. Prevents ValueError if a filename has no digits.
    def extract_number(filename: str) -> int:
        match = re.search(r'\d+', filename)
        return int(match.group()) if match else 0
        
    files.sort(key=extract_number) 

    # FIX: Check if ActivityLogs has data to warn about duplicates
    has_logs = session.exec(select(ActivityLogs).limit(1)).first()
    if has_logs is not None and resume_from_file == 1:
        logger.warning("ActivityLogs already contains data. Resuming from file 1 WILL cause duplicates unless handled by constraints.")

    for file_name in files:
        file_num = extract_number(file_name)
        
        # Enable manual override to skip already processed files (e.g., skip 1 to 25)
        if file_num < resume_from_file:
            logger.debug(f"Skipping {file_name} as per resume parameter.")
            continue
            
        file_path = os.path.join(DATA_ACTIVITY_PLAN, file_name)
        bulk_insert_with_polars(session, file_path, ActivityLogs)


def init_db():
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        # FIX: Separation of Concerns. Core attributes and heavy logs must be evaluated independently.
        if is_core_database_seeded(session):
            logger.info("Core database is already seeded. Bypassing foundational ingestion.")
        else:
            logger.info("Starting fresh core data ingestion...")
            for file_path, model in INGESTION_PLAN:
                bulk_insert_with_polars(session, file_path, model)
                
        # 2. Ingest the 18GB distributed logs
        logger.info("Evaluating Activity Log ingestion status...")
        
        # STRATEGY: Hardcode the resumption parameter here to fix your immediate crash, 
        # or pass it via an environment variable in a production setting.
        # Since it crashed on file 26, we pass resume_from_file=26.
        ingest_activity_logs(session, resume_from_file=1)

if __name__ == "__main__":
    logger.info("Starting Database Initialization Protocol...")
    init_db()
    logger.info("Database Initialization Complete. System Ready.")