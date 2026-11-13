"""Smoke test for invoice numbering. Uses an in-memory SQLite for portability."""
from __future__ import annotations

import pytest

pytest.importorskip("sqlalchemy")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import InvoiceSeries  # noqa: F401  -- registers model
from app.services.invoices.numbering import current_financial_year, next_invoice_number


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    # Only the table under test: the full schema uses Postgres types (JSONB) that SQLite cannot create.
    Base.metadata.create_all(engine, tables=[InvoiceSeries.__table__])
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    s = Session()
    yield s
    s.close()


def test_gapless_sequence(db):
    n1, fy, seq1 = next_invoice_number(db, series_code="BBT-D2C", prefix="BBT/D2C")
    n2, _, seq2 = next_invoice_number(db, series_code="BBT-D2C", prefix="BBT/D2C")
    n3, _, seq3 = next_invoice_number(db, series_code="BBT-D2C", prefix="BBT/D2C")
    assert seq1 == 1 and seq2 == 2 and seq3 == 3
    assert n1.startswith("BBT/D2C/")
    assert fy == current_financial_year()


def test_per_series_independent(db):
    a1, _, _ = next_invoice_number(db, series_code="BBT-D2C", prefix="BBT/D2C")
    b1, _, _ = next_invoice_number(db, series_code="BBT-B2B", prefix="BBT/B2B")
    a2, _, _ = next_invoice_number(db, series_code="BBT-D2C", prefix="BBT/D2C")
    assert a1.endswith("000001")
    assert b1.endswith("000001")
    assert a2.endswith("000002")
