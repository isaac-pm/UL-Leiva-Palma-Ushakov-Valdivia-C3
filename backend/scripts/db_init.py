"""
High-Performance Bulk Ingestion — PostgreSQL + Polars + COPY
============================================================

Design decisions
----------------
* Columns are partitioned into disjoint sets (enum / datetime / jsonb / plain-text)
  before any Polars expression is built → impossible to emit duplicate aliases.
* replace_strict() used instead of deprecated replace(..., default=).
* Enum cast problem solved via staging table:
    COPY  →  TEMP TABLE (all TEXT, no constraints)
    INSERT INTO real_table SELECT col::pg_enum_type FROM staging
  This lets PostgreSQL handle the text→enum cast explicitly, which COPY FROM
  STDIN never does implicitly.
* Staging table name is unique per call (uuid suffix) → safe under concurrency.
* Index drop/recreate around the activity-log bulk load (standard DBA pattern).
* map_elements replaced with vectorised Polars expressions throughout.
"""

import io
import json
import logging
import os
import re
import uuid
from typing import Dict, List, Set, Tuple, Type

import polars as pl
import sqlalchemy as sa
from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

from core.database import get_engine
from core.models import (
    ActivityLogs, Apartments, Buildings, CheckinJournal, Employers,
    FinancialJournal, Jobs, Participants, Pubs, Restaurants, Schools,
    SocialNetwork, TravelJournal,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
)
log = logging.getLogger("db_init")

# ---------------------------------------------------------------------------
# Engine & tuneable constants
# ---------------------------------------------------------------------------
engine = get_engine()

DATA_ROOT           = os.getenv("DATA_PATH", "../data")
ACTIVITY_LOGS_DIR   = os.path.join(DATA_ROOT, "Activity Logs")
SCHEMA_INFER_ROWS   = 2_000     # rows used for CSV schema inference
STREAMING_THRESHOLD = 500_000   # files larger than this are chunked
STREAM_CHUNK_ROWS   = 200_000   # rows per chunk when streaming

NULL_VALUES = ["", "NA", "null", "NULL", "N/A", "n/a", "NaN", "nan"]

INGESTION_PLAN: List[Tuple[str, Type[SQLModel]]] = [
    (os.path.join(DATA_ROOT, "Attributes", "Buildings.csv"),    Buildings),
    (os.path.join(DATA_ROOT, "Attributes", "Participants.csv"), Participants),
    (os.path.join(DATA_ROOT, "Attributes", "Apartments.csv"),   Apartments),
    (os.path.join(DATA_ROOT, "Attributes", "Employers.csv"),    Employers),
    (os.path.join(DATA_ROOT, "Attributes", "Pubs.csv"),         Pubs),
    (os.path.join(DATA_ROOT, "Attributes", "Restaurants.csv"),  Restaurants),
    (os.path.join(DATA_ROOT, "Attributes", "Schools.csv"),      Schools),
    (os.path.join(DATA_ROOT, "Attributes", "Jobs.csv"),         Jobs),
    (os.path.join(DATA_ROOT, "Journals", "CheckinJournal.csv"),   CheckinJournal),
    (os.path.join(DATA_ROOT, "Journals", "FinancialJournal.csv"), FinancialJournal),
    (os.path.join(DATA_ROOT, "Journals", "SocialNetwork.csv"),    SocialNetwork),
    (os.path.join(DATA_ROOT, "Journals", "TravelJournal.csv"),    TravelJournal),
]

# ---------------------------------------------------------------------------
# Normalisation maps  (lowercased-stripped source value → canonical DB value)
# ---------------------------------------------------------------------------
ENUM_MAPS: Dict[str, Dict[str, str]] = {
    "currentMode": {
        "athome":          "AtHome",
        "atwork":          "AtWork",
        "transport":       "Transport",
        "atrecreation":    "AtRecreation",
        "atrestaurant":    "AtRestaurant",
    },
    "buildingType": {
        "residental":  "Residential",   # typo present in source data
        "residential": "Residential",
        "commercial":  "Commercial",
        "school":      "School",
    },
    "educationLevel": {
        "low":                 "Low",
        "highschoolorcollege": "HighSchoolOrCollege",
        "bachelors":           "Bachelors",
        "graduate":            "Graduate",
    },
    "interestGroup": {k.lower(): k for k in "ABCDEFGHIJ"},
    "venueType": {
        "apartment":  "Apartment",
        "pub":        "Pub",
        "restaurant": "Restaurant",
        "workplace":  "Workplace",
    },
    "category": {
        "education":      "Education",
        "food":           "Food",
        "recreation":     "Recreation",
        "rentadjustment": "RentAdjustment",
        "shelter":        "Shelter",
        "wage":           "Wage",
    },
    "purpose": {
        "comingbackfromrestaurant":    "Coming Back From Restaurant",
        "eating":                      "Eating",
        "goingbacktohome":             "Going Back to Home",
        "recreation(socialgathering)": "Recreation (Social Gathering)",
        "work/homecommute":            "Work/Home Commute",
    },
}

DATETIME_COLS: Set[str] = {
    "timestamp", "travelStartTime", "travelEndTime",
    "checkInTime", "checkOutTime",
}

JSONB_COLS: Set[str] = {"daysToWork", "units"}


# ---------------------------------------------------------------------------
# Enum column introspection
# ---------------------------------------------------------------------------

def _pg_enum_columns(model: Type[SQLModel]) -> Dict[str, str]:
    """
    Return {field_name: pg_type_name} for every column whose SQLAlchemy type
    is a PostgreSQL enum (sa.Enum with a .name attribute).

    Example: {"buildingType": "enumbuildingtype"}

    Derived from __table__ — the ground truth — so it handles
    Optional[SomeEnum] and any other wrapper transparently.
    """
    result: Dict[str, str] = {}
    try:
        table_obj = model.__table__
    except AttributeError:
        return result

    for col in table_obj.columns:
        if isinstance(col.type, sa.Enum) and getattr(col.type, "name", None):
            result[col.name] = col.type.name
    return result


# ---------------------------------------------------------------------------
# Ingestion-state bookkeeping
# ---------------------------------------------------------------------------

def _ensure_state_table(session: Session) -> None:
    session.execute(text("""
        CREATE TABLE IF NOT EXISTS ingestion_state (
            filename     TEXT PRIMARY KEY,
            row_count    BIGINT,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    session.commit()


def _processed_files(session: Session) -> Set[str]:
    try:
        return {r[0] for r in session.execute(text("SELECT filename FROM ingestion_state"))}
    except Exception:
        return set()


def _mark_done(session: Session, filename: str, row_count: int) -> None:
    session.execute(
        text("""
            INSERT INTO ingestion_state (filename, row_count)
            VALUES (:f, :n)
            ON CONFLICT (filename) DO NOTHING
        """),
        {"f": filename, "n": row_count},
    )
    session.commit()


# ---------------------------------------------------------------------------
# Index management
# ---------------------------------------------------------------------------

def _get_index_ddls(session: Session, table: str) -> List[str]:
    rows = session.execute(text("""
        SELECT indexdef
        FROM   pg_indexes
        WHERE  tablename = :t
          AND  indexname NOT IN (
              SELECT conname FROM pg_constraint WHERE contype = 'p'
          )
    """), {"t": table}).fetchall()
    return [r[0] for r in rows]


def _drop_indexes(session: Session, table: str) -> List[str]:
    ddls = _get_index_ddls(session, table)
    for ddl in ddls:
        m = re.search(r"INDEX\s+(\S+)\s+ON", ddl, re.IGNORECASE)
        if m:
            session.execute(text(f"DROP INDEX IF EXISTS {m.group(1)}"))
    if ddls:
        session.commit()
        log.info("Dropped %d index(es) on %s", len(ddls), table)
    return ddls


def _recreate_indexes(session: Session, ddls: List[str], table: str) -> None:
    for ddl in ddls:
        session.execute(text(ddl))
    if ddls:
        session.commit()
        log.info("Recreated %d index(es) on %s", len(ddls), table)


# ---------------------------------------------------------------------------
# DataFrame transformation  (strict column partitioning — zero duplicate risk)
# ---------------------------------------------------------------------------

def _transform(df: pl.DataFrame, file_name: str, model: Type[SQLModel]) -> pl.DataFrame:
    """
    Normalise *df* using strictly disjoint column sets per pass.

    Bucket assignment (each column belongs to exactly one bucket):
        jsonb_cols    = JSONB_COLS ∩ present
        datetime_cols = DATETIME_COLS ∩ present
        enum_cols     = ENUM_MAPS.keys() ∩ present
        plain_cols    = Utf8 columns not in any of the above
    """
    if df.is_empty():
        return df

    model_cols = set(model.model_fields.keys())
    df = df.select([c for c in df.columns if c in model_cols])
    if df.is_empty():
        return df

    present       = set(df.columns)
    jsonb_cols    = present & JSONB_COLS
    datetime_cols = present & DATETIME_COLS
    enum_cols     = present & set(ENUM_MAPS.keys())
    special_cols  = jsonb_cols | datetime_cols | enum_cols

    # Pass 1 — plain Utf8 sanitise (null bytes + whitespace)
    plain_exprs = [
        pl.col(c).str.replace_all(r"\x00", "").str.strip_chars().alias(c)
        for c in df.columns
        if df.schema[c] == pl.Utf8 and c not in special_cols
    ]
    if plain_exprs:
        df = df.with_columns(plain_exprs)

    # Pass 2 — enum normalisation
    # replace_strict maps known values; unknown/null → None (safe for Optional fields)
    enum_exprs = [
        pl.col(c)
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.replace_all(r"\s+", "")
        .str.to_lowercase()
        .replace_strict(ENUM_MAPS[c], default=None)
        .alias(c)
        for c in enum_cols
    ]
    if enum_exprs:
        df = df.with_columns(enum_exprs)

    # Pass 3 — datetime parsing
    dt_exprs = [
        pl.col(c)
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.strptime(pl.Datetime("us"), strict=False)
        .alias(c)
        for c in datetime_cols
    ]
    if dt_exprs:
        df = df.with_columns(dt_exprs)

    # Pass 4 — JSONB columns (fully vectorised, no map_elements)
    jsonb_exprs = [
        pl.when(pl.col(c).is_null() | (pl.col(c).cast(pl.Utf8).str.strip_chars() == ""))
        .then(pl.lit("[]"))
        .otherwise(
            pl.lit("[")
            + pl.col(c).cast(pl.Utf8).str.replace_all("'", '"')
            + pl.lit("]")
        )
        .alias(c)
        for c in jsonb_cols
    ]
    if jsonb_exprs:
        df = df.with_columns(jsonb_exprs)

    # Pass 5 — file metadata (only when model declares the field)
    if "file_meta" in model_cols:
        df = df.with_columns(
            pl.lit(json.dumps({"file": file_name})).alias("file_meta")
        )

    return df


# ---------------------------------------------------------------------------
# Core COPY routine — staging table pattern
# ---------------------------------------------------------------------------

def _copy_frame(
    cursor,
    df: pl.DataFrame,
    table: str,
    pg_enum_cols: Dict[str, str],
) -> int:
    """
    Load *df* into *table* via a two-step process:

    Step 1  COPY frame → temporary all-TEXT staging table (zero type constraints).
    Step 2  INSERT INTO real table SELECT … ::pg_enum_type FROM staging.

    Root cause this solves:
        PostgreSQL COPY FROM STDIN does NOT implicitly cast TEXT → enum.
        Any native-enum column raises "invalid input value for enum <type>"
        even when the string value is perfectly valid.
        The staging pattern delegates the cast to a regular INSERT,
        where PostgreSQL's implicit-cast rules apply normally.

    The staging table name contains a UUID suffix to allow safe concurrent use.
    ON COMMIT DROP ensures it is always cleaned up.
    """
    if df.is_empty():
        return 0

    cols    = df.columns
    col_sql = ", ".join(f'"{c}"' for c in cols)
    staging = f"_stage_{table}_{uuid.uuid4().hex[:10]}"

    # Step 1a — create temporary all-text staging table
    text_defs = ", ".join(f'"{c}" TEXT' for c in cols)
    cursor.execute(f"CREATE TEMP TABLE {staging} ({text_defs}) ON COMMIT DROP")

    # Step 1b — COPY raw text into staging
    buf = io.BytesIO()
    df.write_csv(buf, separator="\t", include_header=False, null_value="")
    buf.seek(0)
    cursor.copy_expert(
        f"COPY {staging} ({col_sql}) "
        f"FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', NULL '')",
        buf,
    )

    # Step 2 — INSERT with explicit casts for enum columns
    select_exprs = [
        # NULLIF converts empty string → NULL before the enum cast
        f'NULLIF(TRIM("{c}"), \'\')::{pg_enum_cols[c]}' if c in pg_enum_cols else f'"{c}"'
        for c in cols
    ]
    cursor.execute(
        f"INSERT INTO {table} ({col_sql}) "
        f"SELECT {', '.join(select_exprs)} FROM {staging}"
    )

    return df.height


# ---------------------------------------------------------------------------
# File ingestion
# ---------------------------------------------------------------------------

def _ingest_file(session: Session, path: str, model: Type[SQLModel]) -> int:
    """
    Read *path*, transform, and bulk-load into *model*'s table.
    Files above STREAMING_THRESHOLD rows are processed in slices to bound memory.
    Returns total rows inserted; 0 for missing or empty files.
    """
    if not os.path.exists(path):
        log.warning("File not found, skipping: %s", path)
        return 0

    table     = model.__tablename__
    file_name = os.path.basename(path)

    try:
        df = pl.read_csv(
            path,
            infer_schema_length=SCHEMA_INFER_ROWS,
            null_values=NULL_VALUES,
            ignore_errors=True,
            truncate_ragged_lines=True,
        )
    except Exception as exc:
        log.error("%s — read_csv failed: %s", file_name, exc)
        raise

    if df.is_empty():
        log.warning("%s — empty file, skipping", file_name)
        return 0

    row_count    = df.height
    pg_enum_cols = _pg_enum_columns(model)
    conn         = session.connection().connection

    with conn.cursor() as cur:
        if row_count <= STREAMING_THRESHOLD:
            df    = _transform(df, file_name, model)
            total = _copy_frame(cur, df, table, pg_enum_cols)
        else:
            log.info(
                "%s — %d rows, streaming in chunks of %d",
                file_name, row_count, STREAM_CHUNK_ROWS,
            )
            total = 0
            for start in range(0, row_count, STREAM_CHUNK_ROWS):
                chunk  = _transform(df.slice(start, STREAM_CHUNK_ROWS), file_name, model)
                total += _copy_frame(cur, chunk, table, pg_enum_cols)
                log.debug("%s — %d / %d rows", file_name, total, row_count)

    session.commit()
    log.info("%s — %d rows → %s", file_name, total, table)
    return total


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def bulk_insert(session: Session, path: str, model: Type[SQLModel]) -> None:
    file_name = os.path.basename(path)
    try:
        count = _ingest_file(session, path, model)
        _mark_done(session, file_name, count)
    except Exception as exc:
        session.rollback()
        log.error("%s — ingestion failed: %s", file_name, exc)
        raise


def _natural_sort_key(name: str) -> int:
    m = re.search(r"\d+", name)
    return int(m.group()) if m else 0


def ingest_activity_logs(session: Session) -> None:
    if not os.path.isdir(ACTIVITY_LOGS_DIR):
        log.warning("Activity logs directory not found: %s", ACTIVITY_LOGS_DIR)
        return

    files   = sorted(
        [f for f in os.listdir(ACTIVITY_LOGS_DIR) if f.endswith(".csv")],
        key=_natural_sort_key,
    )
    done    = _processed_files(session)
    pending = [f for f in files if f not in done]

    if not pending:
        log.info("All activity-log files already ingested.")
        return

    log.info("Activity logs: %d file(s) pending", len(pending))
    table      = ActivityLogs.__tablename__
    index_ddls = _drop_indexes(session, table)

    try:
        for file_name in pending:
            bulk_insert(
                session,
                os.path.join(ACTIVITY_LOGS_DIR, file_name),
                ActivityLogs,
            )
    finally:
        _recreate_indexes(session, index_ddls, table)


def init_db() -> None:
    log.info("Creating schema …")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        _ensure_state_table(session)

        if not session.exec(select(Participants).limit(1)).first():
            log.info("Loading attribute / journal files …")
            for path, model in INGESTION_PLAN:
                bulk_insert(session, path, model)

        ingest_activity_logs(session)

    log.info("Ingestion complete.")


if __name__ == "__main__":
    init_db()
