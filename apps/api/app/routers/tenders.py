"""Tender CRUD + ingestion triggers."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthUser, require_staff
from app.db.enums import TenderSource, TenderStatus
from app.db.models import Tender
from app.db.session import get_db
from app.services.tenders.cppp_rss import poll_cppp_rss
from app.services.tenders.email_parser import poll_tender_inbox
from app.services.tenders.writer import upsert_tender

router = APIRouter()


class TenderIn(BaseModel):
    title: str
    buyer_org: str
    description: str | None = None
    published_at: datetime | None = None
    submission_deadline: datetime | None = None
    opening_date: datetime | None = None
    estimated_value: float | None = None
    emd: float | None = None
    category: str | None = None
    product_match: list[str] | None = None
    url: str | None = None
    document_urls: list[str] | None = None
    notes: str | None = None
    status: TenderStatus = TenderStatus.new


@router.get("")
def list_tenders(
    status: TenderStatus | None = None,
    source: TenderSource | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_staff),
) -> dict:
    q = db.query(Tender)
    if status:
        q = q.filter(Tender.status == status)
    if source:
        q = q.filter(Tender.source == source)
    total = q.count()
    rows = q.order_by(Tender.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [_serialize(t) for t in rows],
    }


@router.post("")
def create_manual_tender(
    payload: TenderIn,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_staff),
) -> dict:
    row: dict[str, Any] = payload.model_dump()
    row["source"] = TenderSource.manual
    row["external_id"] = None
    upsert_tender(db, row)
    return {"ok": True}


@router.get("/{tender_id}")
def get_tender(
    tender_id: UUID, db: Session = Depends(get_db), _user: AuthUser = Depends(require_staff)
) -> dict:
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if t is None:
        raise HTTPException(status_code=404, detail="not_found")
    return _serialize(t)


@router.patch("/{tender_id}")
def update_tender(
    tender_id: UUID,
    payload: TenderIn,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_staff),
) -> dict:
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if t is None:
        raise HTTPException(status_code=404, detail="not_found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    db.add(t)
    db.commit()
    return _serialize(t)


@router.post("/poll/rss")
def trigger_rss_poll(_user: AuthUser = Depends(require_staff)) -> dict:
    return {"ingested": poll_cppp_rss()}


@router.post("/poll/email")
def trigger_email_poll(_user: AuthUser = Depends(require_staff)) -> dict:
    return {"ingested": poll_tender_inbox()}


def _serialize(t: Tender) -> dict:
    return {
        "id": str(t.id),
        "source": t.source.value,
        "external_id": t.external_id,
        "title": t.title,
        "buyer_org": t.buyer_org,
        "description": t.description,
        "published_at": t.published_at.isoformat() if t.published_at else None,
        "submission_deadline": t.submission_deadline.isoformat() if t.submission_deadline else None,
        "estimated_value": t.estimated_value,
        "emd": t.emd,
        "category": t.category,
        "product_match": t.product_match or [],
        "url": t.url,
        "document_urls": t.document_urls or [],
        "status": t.status.value,
        "notes": t.notes,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }
