"""Gapless, per-FY sequential invoice numbering.

Uses a row-level lock on invoice_series so we never have to rely on MAX(id)+1
(race condition + audit failure under concurrent invoice generation).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import InvoiceSeries


def current_financial_year(now: datetime | None = None) -> str:
    """India FY runs 1 April -> 31 March. Returns e.g. '2025-26'."""
    now = now or datetime.utcnow()
    start_year = now.year if now.month >= 4 else now.year - 1
    end_year = (start_year + 1) % 100
    return f"{start_year}-{end_year:02d}"


def next_invoice_number(
    db: Session,
    *,
    series_code: str,
    prefix: str | None = None,
    financial_year: str | None = None,
) -> tuple[str, str, int]:
    """Allocate the next sequential invoice number for the given series.

    Returns: (invoice_no, financial_year, sequence_number)

    The series row is locked with SELECT...FOR UPDATE; safe to call inside a
    transaction. Caller MUST commit the surrounding transaction to actually
    consume the number.
    """
    fy = financial_year or current_financial_year()

    stmt = (
        select(InvoiceSeries)
        .where(InvoiceSeries.code == series_code, InvoiceSeries.financial_year == fy)
        .with_for_update()
    )
    row = db.execute(stmt).scalar_one_or_none()

    if row is None:
        row = InvoiceSeries(
            code=series_code,
            financial_year=fy,
            prefix=prefix or series_code,
            next_number=1,
        )
        db.add(row)
        db.flush()
        # Re-lock now that the row exists
        row = db.execute(stmt).scalar_one()

    seq = row.next_number
    row.next_number = seq + 1
    db.flush()

    invoice_no = f"{row.prefix}/{fy}/{seq:06d}"
    return invoice_no, fy, seq
