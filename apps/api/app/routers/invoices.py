"""Invoice generation and retrieval."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.db.models import Invoice
from app.db.session import get_db
from app.services.invoices.service import generate_invoice_for_order

router = APIRouter()


class GenerateIn(BaseModel):
    order_id: UUID


@router.post("/generate")
def generate(payload: GenerateIn, db: Session = Depends(get_db), _user: AuthUser = Depends(get_current_user)) -> dict:
    try:
        inv = generate_invoice_for_order(db, payload.order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"invoice_id": str(inv.id), "invoice_no": inv.invoice_no, "pdf_url": inv.pdf_url}


@router.get("/{invoice_id}")
def get_invoice(invoice_id: UUID, db: Session = Depends(get_db), _user: AuthUser = Depends(get_current_user)) -> dict:
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if inv is None:
        raise HTTPException(status_code=404, detail="not_found")
    return {
        "id": str(inv.id),
        "invoice_no": inv.invoice_no,
        "issued_at": inv.issued_at.isoformat(),
        "grand_total": inv.grand_total,
        "pdf_url": inv.pdf_url,
        "irn": inv.irn,
    }
