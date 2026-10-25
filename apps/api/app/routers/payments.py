"""Razorpay endpoints: order creation, client-callback verification, webhook ingestion."""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthUser, can_access_order, get_current_user
from app.db.models import Order
from app.db.session import get_db
from app.services.payments.razorpay_client import create_razorpay_order
from app.services.payments.razorpay_webhook import handle_webhook_event, verify_client_callback

log = logging.getLogger(__name__)
router = APIRouter()


class CreateOrderIn(BaseModel):
    order_id: UUID


@router.post("/razorpay/order")
def create_order(payload: CreateOrderIn, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)) -> dict:
    order = db.query(Order).filter(Order.id == payload.order_id).first()
    if order is None or not can_access_order(user, order.user_id):
        raise HTTPException(status_code=404, detail="not_found")
    try:
        return create_razorpay_order(db, payload.order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
    result = handle_webhook_event(db, payload, raw, x_razorpay_signature)
    if result.get("reason") == "invalid_signature":
        raise HTTPException(status_code=400, detail="invalid_signature")
    return result
