"""Common writer for tender ingestion -- upserts on (source, external_id).

Matches against product categories (army_boots, oxford_shoes, jackets) using simple
keyword regex on title + description. Manual entries can override via product_match.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.models import Tender

log = logging.getLogger(__name__)

_KEYWORDS = {
    "army_boots": re.compile(r"\b(army|combat|jungle|dms|boots?)\b", re.I),
    "oxford_shoes": re.compile(r"\b(oxford|formal|leather shoe|brogue)\b", re.I),
    "jackets": re.compile(r"\b(jackets?|parka|windcheater|combat jacket|raincoats?)\b", re.I),
    "accessories": re.compile(r"\b(belts?|laces?|insoles?|polish|accessor(y|ies))\b", re.I),
}


def match_product_categories(text: str) -> list[str]:
    if not text:
        return []
    return [cat for cat, rx in _KEYWORDS.items() if rx.search(text)]


def upsert_tender(db: Session, row: dict[str, Any]) -> bool:
    """Upserts on (source, external_id). Returns True if newly inserted."""
    if not row.get("source"):
        raise ValueError("missing_source")
    if not row.get("title"):
        return False

    text = " ".join(filter(None, [row.get("title", ""), row.get("description", "")]))
    if "product_match" not in row or not row["product_match"]:
        row["product_match"] = match_product_categories(text)

    stmt = pg_insert(Tender).values(**row)
    update_cols = {
        k: stmt.excluded[k]
        for k in (
            "title", "buyer_org", "description", "published_at", "submission_deadline",
            "opening_date", "estimated_value", "emd", "category", "url",
            "document_urls", "raw_payload", "product_match",
        )
        if k in row
    }
    if row.get("external_id"):
        stmt = stmt.on_conflict_do_update(
            constraint="uq_tenders_source_external",
            set_={**update_cols, "updated_at": stmt.excluded.created_at},
        ).returning(Tender.id, Tender.created_at, Tender.updated_at)
    result = db.execute(stmt)
    db.commit()
    return result.rowcount > 0
