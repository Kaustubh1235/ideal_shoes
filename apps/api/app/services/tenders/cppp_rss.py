"""CPPP RSS ingestor (Central Public Procurement Portal, eprocure.gov.in).

The feed is partial and inconsistent but free. We parse the loosely-structured
description block for buyer org, value, deadline, etc.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

import feedparser
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.enums import TenderSource
from app.db.session import SessionLocal
from app.services.tenders.writer import upsert_tender

log = logging.getLogger(__name__)


def _parse_deadline(text: str) -> datetime | None:
    if not text:
        return None
    m = re.search(r"Closing\s*Date\s*[:\-]\s*([\d\-/: ]+)", text, re.I)
    if not m:
        return None
    raw = m.group(1).strip()
    for fmt in ("%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt)
        except Exception:
            continue
    return None


def _parse_value(text: str) -> float | None:
    if not text:
        return None
    m = re.search(r"Tender\s*Value\s*[:\-]\s*([\d,.]+)", text, re.I)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except Exception:
        return None


def _parse_buyer(text: str, fallback: str) -> str:
    if not text:
        return fallback
    m = re.search(r"Organisation\s*[:\-]\s*(.+?)(\n|$)", text, re.I)
    return (m.group(1).strip() if m else fallback)[:300]


def poll_cppp_rss(session: Session | None = None) -> int:
    """Fetch and upsert. Returns count of newly inserted rows.
    Can be called as a Celery task or directly via `python -m app.services.tenders.cppp_rss`.
    """
    s = get_settings()
    feed = feedparser.parse(s.cppp_rss_url)
    ingested = 0

    own_session = session is None
    db = session or SessionLocal()
    try:
        for entry in feed.entries:
            title: str = (entry.get("title") or "").strip()
            link: str = entry.get("link") or ""
            ext_id: str | None = entry.get("id") or link or None
            desc: str = entry.get("summary") or entry.get("description") or ""
            pub: datetime | None = None
            if entry.get("published_parsed"):
                pub = datetime(*entry.published_parsed[:6])

            row: dict[str, Any] = {
                "source": TenderSource.rss_cppp,
                "external_id": ext_id[:128] if ext_id else None,
                "title": title[:500],
                "buyer_org": _parse_buyer(desc, "Government of India"),
                "description": desc,
                "published_at": pub,
                "submission_deadline": _parse_deadline(desc),
                "estimated_value": _parse_value(desc),
                "url": link,
                "raw_payload": dict(entry),
            }
            inserted = upsert_tender(db, row)
            if inserted:
                ingested += 1

        log.info("cppp_rss.poll.done", extra={"ingested": ingested, "total": len(feed.entries)})
        return ingested
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":  # pragma: no cover
    print({"ingested": poll_cppp_rss()})
