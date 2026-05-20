"""Razorpay order creation. Returns the gateway order id to hand to Razorpay Checkout."""
from __future__ import annotations

import logging

import razorpay
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Order, Payment

log = logging.getLogger(__name__)
settings = get_settings()


def _client():
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        return None
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def create_razorpay_order(db: Session, order_id) -> dict:
    """Idempotent: if a Payment already exists for this order with gateway_order_id, reuse it.
    Returns the data the Next.js client needs to open Razorpay Checkout.
    """
    order: Order | None = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise ValueError(f"order_not_found:{order_id}")

    if order.grand_total <= 0:
        raise ValueError("order_total_zero")

    existing: Payment | None = (
        db.query(Payment)
        .filter(Payment.order_id == order.id, Payment.gateway == "razorpay")
        .order_by(Payment.created_at.desc())
        .first()
    )
    if existing and existing.gateway_order_id:
        rzp_order_id = existing.gateway_order_id
    else:
        client = _client()
        if client is None:
            log.warning("razorpay.keys_missing.using_mock_id")
            rzp_order_id = f"order_DEVMOCK_{order.order_no}"
        else:
            resp = client.order.create(
                {
                    "amount": int(order.grand_total),  # paise
                    "currency": "INR",
                    "receipt": order.order_no,
                    "notes": {"order_id": str(order.id), "channel": order.channel.value},
                    "payment_capture": 1,
                }
            )
            rzp_order_id = resp["id"]

        payment = Payment(
            order_id=order.id,
            gateway="razorpay",
            gateway_order_id=rzp_order_id,
            amount=order.grand_total,
            currency="INR",
            status="created",
        )
        db.add(payment)
        db.commit()

    return {
        "razorpay_order_id": rzp_order_id,
        "amount": int(order.grand_total),
        "currency": "INR",
        "key_id": settings.razorpay_key_id or "rzp_dev_placeholder",
        "order_id": str(order.id),
    }
