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


@celery_app.task(name="notify.email", autoretry_for=(OSError,), retry_backoff=True, max_retries=5)
def task_send_email(to: str, subject: str, html: str) -> bool:
    """Send one HTML email over SMTP. Skipped (False) until SMTP_HOST is set."""
    import smtplib
    from email.message import EmailMessage
    from email.utils import make_msgid

    from app.config import get_settings

    s = get_settings()
    if not s.smtp_host:
        log.info("email.not_configured.skipping subject=%s", subject)
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(s.smtp_from.rsplit("@", 1)[-1].strip("> ") or None))
    if s.seller_email:
        msg["Reply-To"] = s.seller_email
    msg.set_content("This message is best viewed as HTML.")
    msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
        if s.smtp_tls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_pass)
        smtp.send_message(msg)
    return True


@celery_app.task(name="notify.order_confirmed_email")
def task_order_confirmed_email(order_id: str) -> bool:
    """Confirmation mail for a paid order, to the account email or the one given at checkout."""
    from app.db.models import Order
    from app.services.notify.order_messages import order_confirmed_email, order_contact

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == UUID(order_id)).first()
        if order is None:
            return False
        name, _phone, email = order_contact(db, order)
        if not email:
            log.info("email.no_address.skipping order=%s", order.order_no)
            return False
        subject, html = order_confirmed_email(order, name)
        task_send_email.delay(email, subject, html)
        return True
    finally:
        db.close()


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
    """Send the approved `order_confirmed` WhatsApp template for a paid order (no-op if unset).
    Guests are reached on the phone number of their delivery address."""
    from app.db.models import Order
    from app.services.notify.order_messages import order_contact
    from app.services.whatsapp.client import send_template

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == UUID(order_id)).first()
        if order is None:
            return False
        name, phone, _email = order_contact(db, order)
        amount = f"{order.grand_total / 100:,.0f}"
        return send_template(phone, "order_confirmed", [name, order.order_no, amount])
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
