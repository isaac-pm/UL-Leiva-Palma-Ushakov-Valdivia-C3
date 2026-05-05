"""
High-Performance Bulk Ingestion — PostgreSQL + Polars + COPY
============================================================
Key design decisions
--------------------
* Single `with_columns` call per transformation domain (no duplicate aliases).
* Columns are partitioned into non-overlapping sets before any expression is built,
  so the same column can NEVER appear twice in the same `with_columns` call.
* BATCH_SIZE is measured in *rows*, not in Polars "next_batches" chunks —
  a single COPY per file is used when the frame fits in memory; streaming is
  used only for the large activity-log files.
* Indexes are dropped before bulk load and recreated after (standard DBA pattern).
* `map_elements` is replaced with a pure Polars expression for JSONB columns.
* Schema is inferred once from the first N rows; subsequent batches reuse it.
"""

import io
import json
import logging
import os
import re
import uuid
from typing import Dict, List, Optional, Set, Type

import polars as pl
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
# Constants
# ---------------------------------------------------------------------------
engine = get_engine()

DATA_ROOT           = os.getenv("DATA_PATH", "../data")
ACTIVITY_LOGS_DIR   = os.path.join(DATA_ROOT, "Activity Logs")
SCHEMA_INFER_ROWS   = 2_000        # fewer rows → faster cold start, still safe
STREAMING_THRESHOLD = 500_000      # rows: above this we stream, below we load whole file
STREAM_CHUNK_ROWS   = 200_000      # rows per COPY in streaming mode

NULL_VALUES = ["", "NA", "null", "NULL", "N/A", "n/a", "NaN", "nan"]

INGESTION_PLAN: List[tuple] = [
    (os.path.join(DATA_ROOT, "Attributes", "Buildings.csv"),    Buildings),
    (os.path.join(DATA_ROOT, "Attributes", "Participants.csv"), Participants),
    (os.path.join(DATA_ROOT, "Attributes", "Apartments.csv"),   Apartments),
    (os.path.join(DATA_ROOT, "Attributes", "Employers.csv"),    Employers),
    (os.path.join(DATA_ROOT, "Attributes", "Pubs.csv"),         Pubs),
    (os.path.join(DATA_ROOT, "Attributes", "Restaurants.csv"),  Restaurants),
    (os.path.join(DATA_ROOT, "Attributes", "Schools.csv"),      Schools),
    (os.path.join(DATA_ROOT, "Attributes", "Jobs.csv"),         Jobs),
    (os.path.join(DATA_ROOT, "Journals", "CheckinJournal.csv"),    CheckinJournal),
    (os.path.join(DATA_ROOT, "Journals", "FinancialJournal.csv"),  FinancialJournal),
    (os.path.join(DATA_ROOT, "Journals", "SocialNetwork.csv"),     SocialNetwork),
    (os.path.join(DATA_ROOT, "Journals", "TravelJournal.csv"),     TravelJournal),
]

# ---------------------------------------------------------------------------
# Enum normalisation maps  (source → canonical)
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
        "residental":  "Residential",
        "residential": "Residential",
        "commercial":  "Commercial",
        "school":      "School",
    },
    "educationLevel": {
        "low":                  "Low",
        "highschoolorcollege":  "HighSchoolOrCollege",
        "bachelors":            "Bachelors",
        "graduate":             "Graduate",
    },
    "interestGroup": {k.lower(): k for k in "ABCDEFGHIJ"},
    "venueType": {
        "apartment":  "Apartment",
        "pub":        "Pub",
        "restaurant": "Restaurant",
        "workplace":  "Workplace",
    },
    "category": {
        "education":       "Education",
        "food":            "Food",
        "recreation":      "Recreation",
        "rentadjustment":  "RentAdjustment",
        "shelter":         "Shelter",
        "wage":            "Wage",
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
# Ingestion-state table
# ---------------------------------------------------------------------------

def _ensure_state_table(session: Session) -> None:
    session.execute(text("""
        CREATE TABLE IF NOT EXISTS ingestion_state (
            filename    TEXT PRIMARY KEY,
            row_count   BIGINT,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    session.commit()


def _processed_files(session: Session) -> Set[str]:
    try:
        rows = session.execute(text("SELECT filename FROM ingestion_state"))
        return {r[0] for r in rows}
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
# Index management  — drop before bulk, restore after
# ---------------------------------------------------------------------------

def _index_ddl(session: Session, table: str) -> List[str]:
    """Return CREATE INDEX statements for all non-PK indexes on *table*."""
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
    """Drop all non-PK indexes and return their DDL for later recreation."""
    ddls = _index_ddl(session, table)
    for ddl in ddls:
        # derive index name from CREATE [UNIQUE] INDEX <name> ON …
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
# DataFrame transformation
# ---------------------------------------------------------------------------

def _transform(df: pl.DataFrame, file_name: str, model: Type[SQLModel]) -> pl.DataFrame:
    """
    Apply all normalisations to *df* and return a frame whose columns
    exactly match the model fields present in the data.

    Rule: each column appears in **at most one** `with_columns` call.
    We achieve this by partitioning columns into disjoint buckets and
    processing each bucket independently.
    """
    if df.is_empty():
        return df

    # 1. Keep only columns that exist in the model
    model_cols = set(model.model_fields.keys())
    df = df.select([c for c in df.columns if c in model_cols])

    if df.is_empty():
        return df

    present = set(df.columns)

    # ------------------------------------------------------------------
    # Pass 1 — sanitise raw string columns
    #   Applies ONLY to columns that are NOT also enum / datetime / JSONB
    #   columns so we never emit the same alias twice.
    # ------------------------------------------------------------------
    enum_cols     = present & set(ENUM_MAPS.keys())
    datetime_cols = present & DATETIME_COLS
    jsonb_cols    = present & JSONB_COLS
    # string-only: Utf8 columns that are not handled by another pass
    special_cols  = enum_cols | datetime_cols | jsonb_cols

    sanitise_exprs = []
    for col in df.columns:
        if df.schema[col] == pl.Utf8 and col not in special_cols:
            sanitise_exprs.append(
                pl.col(col)
                .str.replace_all(r"\x00", "")
                .str.strip_chars()
                .alias(col)
            )

    if sanitise_exprs:
        df = df.with_columns(sanitise_exprs)

    # ------------------------------------------------------------------
    # Pass 2 — enum normalisation
    #   Each enum column gets exactly one expression.
    # ------------------------------------------------------------------
    enum_exprs = [
        pl.col(col)
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.replace_all(r"\s+", "")
        .str.to_lowercase()
        .replace(ENUM_MAPS[col], default=None)
        .alias(col)
        for col in enum_cols
    ]

    if enum_exprs:
        df = df.with_columns(enum_exprs)

    # ------------------------------------------------------------------
    # Pass 3 — datetime parsing
    # ------------------------------------------------------------------
    dt_exprs = [
        pl.col(col)
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.strptime(pl.Datetime("us"), strict=False)
        .alias(col)
        for col in datetime_cols
    ]

    if dt_exprs:
        df = df.with_columns(dt_exprs)

    # ------------------------------------------------------------------
    # Pass 4 — JSONB columns
    #   Pure-Polars expression; no Python-level map_elements.
    #   Strategy: replace single quotes → double quotes, then wrap in [].
    #   Nulls / empty strings become the JSON literal "[]".
    # ------------------------------------------------------------------
    jsonb_exprs = [
        pl.when(pl.col(col).is_null() | (pl.col(col).cast(pl.Utf8).str.strip_chars() == ""))
        .then(pl.lit("[]"))
        .otherwise(
            pl.lit("[")
            + pl.col(col).cast(pl.Utf8).str.replace_all("'", '"')
            + pl.lit("]")
        )
        .alias(col)
        for col in jsonb_cols
    ]

    if jsonb_exprs:
        df = df.with_columns(jsonb_exprs)

    # ------------------------------------------------------------------
    # Pass 5 — metadata column (only if model declares it)
    # ------------------------------------------------------------------
    if "file_meta" in model_cols:
        df = df.with_columns(
            pl.lit(json.dumps({"file": file_name})).alias("file_meta")
        )

    return df


# ---------------------------------------------------------------------------
# Core COPY routine
# ---------------------------------------------------------------------------

def _copy_frame(cursor, df: pl.DataFrame, table: str) -> int:
    """Write *df* to *table* via COPY … FROM STDIN and return row count."""
    if df.is_empty():
        return 0

    buf = io.BytesIO()
    df.write_csv(buf, separator="\t", include_header=False, null_value="")
    buf.seek(0)

    cols = ", ".join(f'"{c}"' for c in df.columns)
    sql  = (
        f"COPY {table} ({cols}) FROM STDIN "
        f"WITH (FORMAT csv, DELIMITER E'\\t', NULL '')"
    )
    cursor.copy_expert(sql, buf)
    return df.height


# ---------------------------------------------------------------------------
# File ingestion  (single file, one COPY or streamed)
# ---------------------------------------------------------------------------

def _ingest_file(session: Session, path: str, model: Type[SQLModel]) -> int:
    """
    Ingest one CSV file into *model*'s table.
    Returns total rows inserted; 0 if file missing or empty.
    Raises on unrecoverable error.
    """
    if not os.path.exists(path):
        log.warning("File not found, skipping: %s", path)
        return 0

    table     = model.__tablename__
    file_name = os.path.basename(path)

    # --- read full frame first (fast for attribute CSVs < 500 k rows) ---
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

    row_count = df.height
    conn      = session.connection().connection

    with conn.cursor() as cur:
        if row_count <= STREAMING_THRESHOLD:
            # ---- small/medium file: one COPY ----
            df = _transform(df, file_name, model)
            total = _copy_frame(cur, df, table)
        else:
            # ---- large file: chunk into STREAM_CHUNK_ROWS slices ----
            log.info("%s — large file (%d rows), streaming in chunks of %d",
                     file_name, row_count, STREAM_CHUNK_ROWS)
            total = 0
            for start in range(0, row_count, STREAM_CHUNK_ROWS):
                chunk = df.slice(start, STREAM_CHUNK_ROWS)
                chunk = _transform(chunk, file_name, model)
                total += _copy_frame(cur, chunk, table)
                log.debug("%s — %d/%d rows copied", file_name, total, row_count)

    session.commit()
    log.info("%s — %d rows inserted into %s", file_name, total, table)
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


def _natural_key(name: str) -> int:
    m = re.search(r"\d+", name)
    return int(m.group()) if m else 0


def ingest_activity_logs(session: Session) -> None:
    if not os.path.isdir(ACTIVITY_LOGS_DIR):
        log.warning("Activity logs directory not found: %s", ACTIVITY_LOGS_DIR)
        return

    files = sorted(
        [f for f in os.listdir(ACTIVITY_LOGS_DIR) if f.endswith(".csv")],
        key=_natural_key,
    )
    done  = _processed_files(session)
    table = ActivityLogs.__tablename__

    pending = [f for f in files if f not in done]
    if not pending:
        log.info("All activity-log files already ingested.")
        return

    log.info("Activity logs: %d files to ingest", len(pending))

    # Drop indexes once for the entire batch; recreate at the end
    index_ddls = _drop_indexes(session, table)

    try:
        for file_name in pending:
            full_path = os.path.join(ACTIVITY_LOGS_DIR, file_name)
            bulk_insert(session, full_path, ActivityLogs)
    finally:
        _recreate_indexes(session, index_ddls, table)


def init_db() -> None:
    log.info("Creating schema …")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        _ensure_state_table(session)

        # ---- attribute + journal files (idempotent guard) ----
        if not session.exec(select(Participants).limit(1)).first():
            log.info("Loading attribute / journal files …")
            for path, model in INGESTION_PLAN:
                bulk_insert(session, path, model)

        # ---- activity logs (incremental / resumable) ----
        ingest_activity_logs(session)

    log.info("Ingestion complete.")


if __name__ == "__main__":
    init_db()