"""Razorpay webhook handler.

Pipeline:
  1. Verify HMAC-SHA256 signature against RAZORPAY_WEBHOOK_SECRET.
  2. Persist every event in payment_events (with `event_id` as a unique key for dedupe).
  3. Project the event onto the Payment row (status, captured_at, refund, etc.).
  4. On `payment.captured`: mark Order paid, fire invoice-generation Celery task.

Idempotency: same `event_id` arriving twice short-circuits at step 2 (unique index).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Order, Payment, PaymentEvent

log = logging.getLogger(__name__)
settings = get_settings()


def verify_webhook_signature(payload: bytes, received_sig: str) -> bool:
    if not settings.razorpay_webhook_secret:
        log.warning("razorpay_webhook.no_secret_configured.failing_closed")
        return False
    expected = hmac.new(
        settings.razorpay_webhook_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, received_sig)


def verify_client_callback(order_id: str, payment_id: str, signature: str) -> bool:
    """Used on the client redirect after Razorpay Checkout success (separate signature)."""
    if not settings.razorpay_key_secret:
        return False
    msg = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"), msg, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def handle_webhook_event(db: Session, payload: dict[str, Any], raw_body: bytes, signature: str) -> dict:
    if not verify_webhook_signature(raw_body, signature):
        log.warning("razorpay_webhook.invalid_signature")
        return {"ok": False, "reason": "invalid_signature"}

    event_id = payload.get("id") or payload.get("event_id")
    event_type = payload.get("event")
    entity = (payload.get("payload") or {}).get("payment", {}).get("entity") or {}

    if not event_id or not event_type:
        return {"ok": False, "reason": "missing_event_id_or_type"}

    gateway_order_id = entity.get("order_id")
    gateway_payment_id = entity.get("id")

    payment: Payment | None = None
    if gateway_order_id:
        payment = (
            db.query(Payment)
            .filter(Payment.gateway_order_id == gateway_order_id, Payment.gateway == "razorpay")
            .order_by(Payment.created_at.desc())
            .first()
        )

    # Persist event for audit; unique on event_id provides dedupe.
    evt = PaymentEvent(
        payment_id=payment.id if payment else None,
        gateway="razorpay",
        event_type=event_type,
        event_id=event_id,
        signature=signature,
        raw=payload,
    )
    db.add(evt)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        log.info("razorpay_webhook.duplicate_event.skipping", extra={"event_id": event_id})
        return {"ok": True, "duplicate": True}

    # Project onto Payment / Order
    if payment is None:
        # Orphan event -- still recorded above. Most likely happens if our DB lost the create
        # between order creation and webhook arrival; will require manual reconciliation.
        db.commit()
        return {"ok": True, "orphan": True}

    if event_type == "payment.authorized":
        payment.status = "authorized"
        payment.gateway_payment_id = gateway_payment_id
        payment.method = entity.get("method")
        payment.raw_payload = entity
    elif event_type == "payment.captured":
        payment.status = "captured"
        payment.gateway_payment_id = gateway_payment_id
        payment.method = entity.get("method")
        payment.raw_payload = entity

        order: Order | None = db.query(Order).filter(Order.id == payment.order_id).first()
        if order and order.status.value in ("pending_payment", "draft"):
            order.status = "paid"
            order.paid_at = datetime.now(timezone.utc)
            db.add(order)

            # Enqueue invoice generation (async)
            try:
                from app.worker.celery_app import celery_app
                celery_app.send_task("invoices.generate", args=[str(order.id)])
            except Exception as e:  # noqa: BLE001
                log.warning("invoice_enqueue_failed", extra={"error": str(e)})
    elif event_type == "payment.failed":
        payment.status = "failed"
        payment.gateway_payment_id = gateway_payment_id
        payment.raw_payload = entity
    elif event_type.startswith("refund."):
        payment.status = "refunded"
        payment.raw_payload = entity

    db.add(payment)
    db.commit()

    return {"ok": True, "event": event_type}
