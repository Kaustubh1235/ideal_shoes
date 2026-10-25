"""Invoice generation and retrieval."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthUser, can_access_order, get_current_user, require_staff
from app.db.models import Invoice, Order
from app.db.session import get_db
from app.services.invoices.service import generate_invoice_for_order
from app.services.storage.s3 import s3_client

router = APIRouter()


class GenerateIn(BaseModel):
    order_id: UUID


@router.post("/generate")
def generate(payload: GenerateIn, db: Session = Depends(get_db), _user: AuthUser = Depends(require_staff)) -> dict:
    try:
        inv = generate_invoice_for_order(db, payload.order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"invoice_id": str(inv.id), "invoice_no": inv.invoice_no}


def _invoice_for(db: Session, invoice_id: UUID, user: AuthUser) -> Invoice:
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    order = db.query(Order).filter(Order.id == inv.order_id).first() if inv else None
    # 404 rather than 403 so invoice ids cannot be probed.
    if inv is None or order is None or not can_access_order(user, order.user_id):
        raise HTTPException(status_code=404, detail="not_found")
    return inv


@router.get("/{invoice_id}")
def get_invoice(invoice_id: UUID, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)) -> dict:
    inv = _invoice_for(db, invoice_id, user)
    return {
        "id": str(inv.id),
        "invoice_no": inv.invoice_no,
        "issued_at": inv.issued_at.isoformat(),
        "grand_total": inv.grand_total,
        "has_pdf": bool(inv.pdf_url),
        "irn": inv.irn,
    }


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: UUID, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)) -> RedirectResponse:
    """Five-minute download link for the PDF; the object itself is private."""
    inv = _invoice_for(db, invoice_id, user)
    if not inv.pdf_url:
        raise HTTPException(status_code=404, detail="pdf_not_ready")
    name = f"{inv.invoice_no.replace('/', '_')}.pdf"
    return RedirectResponse(s3_client.presigned_get(inv.pdf_url, filename=name), status_code=302)
