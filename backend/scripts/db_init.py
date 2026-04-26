import os
import re
import logging
from typing import Any, List, Type

import polars as pl
from polars.exceptions import NoDataError
from sqlalchemy import insert
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
# Logging
# -----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("database_init")

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
engine = get_engine()
DATA_ROOT = os.getenv("DATA_PATH", "../data")
CHUNK_SIZE = 15_000
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

ARRAY_COLUMNS = {"daysToWork", "units"}
TIME_COLUMNS = {
    "startTime",
    "endTime",
    "checkInTime",
    "checkOutTime",
}


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def parse_broken_array(value: Any) -> List[str]:
    if not isinstance(value, str) or not value.strip():
        return []

    cleaned = value.strip("[]").strip()

    if not cleaned:
        return []

    return [
        item.strip().strip("'\"")
        for item in cleaned.split(",")
    ]


def sanitize_dataframe(df: pl.DataFrame) -> pl.DataFrame:
    string_columns = [
        col for col, dtype in df.schema.items()
        if dtype == pl.Utf8
    ]

    if not string_columns:
        return df

    return df.with_columns([
        pl.col(col).str.replace_all("\x00", "")
        for col in string_columns
    ])


def transform_dataframe(
    df: pl.DataFrame,
    file_name: str,
    model: Type[SQLModel]
) -> pl.DataFrame:
    """
    Apply all transformations in a single pass as much as possible.
    """
    expressions = []

    if "buildingType" in df.columns:
        expressions.append(
            pl.col("buildingType").str.replace(
                "Residental",
                "Residential"
            )
        )

    for col in ARRAY_COLUMNS.intersection(df.columns):
        expressions.append(
            pl.col(col).map_elements(
                parse_broken_array,
                return_dtype=pl.List(pl.Utf8)
            )
        )

    for col in TIME_COLUMNS.intersection(df.columns):
        if df.schema[col] == pl.Utf8:
            expressions.append(
                pl.col(col).str.strptime(
                    pl.Time,
                    "%I:%M:%S %p",
                    strict=False
                )
            )

    if "metadata" in model.model_fields:
        expressions.append(
            pl.struct(
                [pl.lit(file_name).alias("filename")]
            ).alias("metadata")
        )

    if expressions:
        df = df.with_columns(expressions)

    return df


def insert_dataframe_in_chunks(
    session: Session,
    df: pl.DataFrame,
    model: Type[SQLModel],
    file_name: str
) -> None:
    total_rows = df.height

    for offset in range(0, total_rows, CHUNK_SIZE):
        chunk_df = df.slice(offset, CHUNK_SIZE)
        records = chunk_df.to_dicts()

        try:
            session.execute(insert(model), records)
            session.commit()

            logger.info(
                f"{file_name}: inserted rows "
                f"{offset} - {min(offset + CHUNK_SIZE, total_rows)}"
            )

        except Exception as exc:
            session.rollback()

            logger.error(
                f"Chunk insert failed for {file_name}: "
                f"{str(exc)[:200]}"
            )

            logger.warning(
                f"Skipping remaining rows in {file_name}"
            )
            return


# -----------------------------------------------------------------------------
# Core ingestion
# -----------------------------------------------------------------------------
def bulk_insert_with_polars(
    session: Session,
    file_path: str,
    model: Type[SQLModel]
) -> None:
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        return

    file_name = os.path.basename(file_path)
    logger.info(f"Processing {file_name}")

    try:
        df = pl.read_csv(
            file_path,
            null_values=["N/A", "NA", "null", "", "NULL"],
            infer_schema_length=CSV_SCHEMA_INFERENCE,
            ignore_errors=False,
        )

    except NoDataError:
        logger.error(f"Empty or corrupted file: {file_name}")
        return

    except Exception as exc:
        logger.error(
            f"Failed to read {file_name}: {exc}"
        )
        return

    if df.is_empty():
        logger.warning(f"Skipping empty file: {file_name}")
        return

    df = sanitize_dataframe(df)
    df = transform_dataframe(df, file_name, model)

    insert_dataframe_in_chunks(
        session=session,
        df=df,
        model=model,
        file_name=file_name
    )


# -----------------------------------------------------------------------------
# Activity logs
# -----------------------------------------------------------------------------
def extract_number(filename: str) -> int:
    match = re.search(r"\d+", filename)
    return int(match.group()) if match else 0


def ingest_activity_logs(
    session: Session,
    resume_from_file: int = 1
) -> None:
    if not os.path.exists(ACTIVITY_LOGS_PATH):
        logger.warning(
            f"Missing directory: {ACTIVITY_LOGS_PATH}"
        )
        return

    files = sorted(
        (
            f for f in os.listdir(ACTIVITY_LOGS_PATH)
            if f.startswith("ParticipantStatusLogs")
            and f.endswith(".csv")
        ),
        key=extract_number
    )

    for file_name in files:
        file_number = extract_number(file_name)

        if file_number < resume_from_file:
            continue

        file_path = os.path.join(
            ACTIVITY_LOGS_PATH,
            file_name
        )

        bulk_insert_with_polars(
            session,
            file_path,
            ActivityLogs
        )


# -----------------------------------------------------------------------------
# DB initialization
# -----------------------------------------------------------------------------
def init_db() -> None:
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        already_loaded = session.exec(
            select(Participants).limit(1)
        ).first()

        if not already_loaded:
            logger.info("Loading core datasets")

            for file_path, model in INGESTION_PLAN:
                bulk_insert_with_polars(
                    session,
                    file_path,
                    model
                )

        logger.info(
            "Starting activity logs from file 55"
        )

        ingest_activity_logs(
            session,
            resume_from_file=55
        )


if __name__ == "__main__":
    init_db()