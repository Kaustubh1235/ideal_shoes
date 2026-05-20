"""Razorpay endpoints: order creation, client-callback verification, webhook ingestion."""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.db.session import get_db
from app.services.payments.razorpay_client import create_razorpay_order
from app.services.payments.razorpay_webhook import handle_webhook_event, verify_client_callback

log = logging.getLogger(__name__)
router = APIRouter()


class CreateOrderIn(BaseModel):
    order_id: UUID


@router.post("/razorpay/order")
def create_order(payload: CreateOrderIn, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)) -> dict:
    return create_razorpay_order(db, payload.order_id)


class VerifyCallbackIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/razorpay/verify")
def verify_callback(payload: VerifyCallbackIn) -> dict:
    ok = verify_client_callback(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
    )
    if not ok:
        raise HTTPException(status_code=400, detail="invalid_signature")
    return {"verified": True}


@router.post("/razorpay/webhook")
async def webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_razorpay_signature: str | None = Header(default=None),
) -> dict:
    raw = await request.body()
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_json")
    if not x_razorpay_signature:
        raise HTTPException(status_code=400, detail="missing_signature")
    return handle_webhook_event(db, payload, raw, x_razorpay_signature)
