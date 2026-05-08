# src/core/database.py
from sqlmodel import create_engine, Session

import logging
import os

logger = logging.getLogger("Database")


class DatabaseEnvs:
    DB_USERNAME = os.getenv("DB_USERNAME")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_NAME = os.getenv("DB_NAME")
    # Default to docker-compose service name if not provided
    DB_HOST = os.getenv("DB_HOST", "hpdav-db")

    DB_PORT = os.getenv("DB_PORT", "5432")
    DATABASE_URL: str = (
        f"postgresql://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    ASYNC_DB_URL = DATABASE_URL.replace("postgresql+psycopg2", "postgresql")

    # Print all environment variables for debugging
    print("Database Configuration:")
    print(f"DB_USERNAME: {DB_USERNAME}")
    print(f"DB_PASSWORD: {DB_PASSWORD}")
    print(f"DB_NAME: {DB_NAME}")
    print(f"DB_HOST: {DB_HOST}")
    print(f"DB_PORT: {DB_PORT}")
    print(f"DATABASE_URL: {DATABASE_URL}")


engine = create_engine(
    DatabaseEnvs.DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)


def get_engine():
    return engine


def get_db_session():
    engine = get_engine()
    with Session(engine) as session:
        yield session
