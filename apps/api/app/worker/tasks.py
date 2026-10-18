"""Celery tasks. Keep them thin -- delegate to services."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from app.db.models import IdempotencyKey
from app.db.session import SessionLocal
from app.services.gstr.exporter import export_gstr1
from app.services.inventory.sync import post_order_stock_out, sync_stock_from_inventory
from app.services.invoices.service import generate_invoice_for_order
from app.services.tenders.cppp_rss import poll_cppp_rss
from app.services.tenders.email_parser import poll_tender_inbox
from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="invoices.generate", bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=5)
def task_generate_invoice(self, order_id: str) -> str:
    db = SessionLocal()
    try:
        inv = generate_invoice_for_order(db, UUID(order_id))
        return str(inv.id)
    finally:
        db.close()


@celery_app.task(name="tenders.poll_rss")
def task_poll_rss() -> dict:
    return {"ingested": poll_cppp_rss()}


@celery_app.task(name="tenders.poll_email")
def task_poll_email() -> dict:
    return {"ingested": poll_tender_inbox()}


@celery_app.task(name="gstr.export_r1")
def task_export_gstr1(month: str) -> dict:
    db = SessionLocal()
    try:
        url = export_gstr1(db, month)
        return {"month": month, "url": url}
    finally:
        db.close()


@celery_app.task(name="notify.email")
def task_send_email(to: str, subject: str, html: str) -> bool:
    """Lightweight SMTP send. For richer templated emails, expand later."""
    import smtplib
    from email.message import EmailMessage
    from app.config import get_settings

    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("HTML email -- see body")
    msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(s.smtp_host, s.smtp_port) as smtp:
        if s.smtp_tls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_pass)
        smtp.send_message(msg)
    return True


@celery_app.task(name="inventory.sync_stock")
def task_sync_stock_from_inventory() -> dict:
    """Pull stock levels from the inventory app into inventory.on_hand (every 15 min)."""
    db = SessionLocal()
    try:
        return sync_stock_from_inventory(db).as_dict()
    finally:
        db.close()


@celery_app.task(name="inventory.order_out", bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=5)
def task_inventory_order_out(self, order_id: str) -> dict:
    """Tell the inventory app a paid web order consumed stock. Idempotent per order item."""
    from app.db.models import Order

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == UUID(order_id)).first()
        if order is None:
            return {"order_id": order_id, "accepted": 0, "reason": "order_not_found"}
        return {"order_id": order_id, "order_no": order.order_no, "accepted": post_order_stock_out(db, order)}
    finally:
        db.close()


@celery_app.task(name="notify.whatsapp_order_confirmed", autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def task_whatsapp_order_confirmed(order_id: str) -> bool:
    """Send the approved `order_confirmed` WhatsApp template for a paid order (no-op if unset)."""
    from app.db.models import Order
    from app.services.whatsapp.client import send_template

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == UUID(order_id)).first()
        if order is None or order.user is None:
            return False
        name = (order.user.customer.name if order.user.customer and order.user.customer.name else "there")
        amount = f"{order.grand_total / 100:,.0f}"
        return send_template(order.user.phone, "order_confirmed", [name, order.order_no, amount])
    finally:
        db.close()


@celery_app.task(name="maint.cleanup_idempotency")
def task_cleanup_idempotency() -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        deleted = (
            db.query(IdempotencyKey)
            .filter(IdempotencyKey.expires_at < now)
            .delete(synchronize_session=False)
        )
        db.commit()
        return deleted
    finally:
        db.close()
