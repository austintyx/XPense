import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app import models  # noqa: F401  (registers tables on Base.metadata)

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://user:pass@localhost:5432/expenses_test"
)


def _ensure_test_database() -> None:
    admin_url, dbname = TEST_DATABASE_URL.rsplit("/", 1)
    admin_engine = create_engine(f"{admin_url}/postgres", isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": dbname}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{dbname}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def test_engine():
    _ensure_test_database()
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def db_session(test_engine):
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
