"""DB engine + session factory."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()
_db_url = settings.database_url
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Pool sizing applies to Postgres only; SQLite (used by the unit tests) has no queue pool.
_pool = {} if _db_url.startswith("sqlite") else {"pool_size": 10, "max_overflow": 20}
engine = create_engine(_db_url, pool_pre_ping=True, future=True, **_pool)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
