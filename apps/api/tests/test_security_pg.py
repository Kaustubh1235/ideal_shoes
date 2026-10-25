"""Security behaviour that needs the real schema: OTP, invoice/order access, the Razorpay webhook.

Runs against Postgres when TEST_DATABASE_URL is set (the models use JSONB and enums), e.g.
inside the stack:  TEST_DATABASE_URL=postgresql://...  pytest tests/test_security_pg.py
Skipped otherwise.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid

import pytest

PG = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not PG, reason="needs TEST_DATABASE_URL (Postgres)")

if PG:
    os.environ["DATABASE_URL"] = PG
os.environ.setdefault("AUTH_SECRET", "test-secret-test-secret")


@pytest.fixture(scope="module")
def env():
    from fastapi.testclient import TestClient
    from jose import jwt
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app

    url = PG.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(url)
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    s = get_settings()

    def token(sub: str, user_type: str) -> dict:
        t = jwt.encode({"sub": sub, "userType": user_type, "iss": s.jwt_issuer, "aud": s.jwt_audience}, s.auth_secret, algorithm="HS256")
        return {"authorization": f"Bearer {t}"}

    yield {"client": TestClient(app), "Session": Session, "token": token, "settings": s}
    app.dependency_overrides.clear()


def _order(Session, user_id=None, total=209900):
    from app.db.models import Order, Payment, User

    db = Session()
    if user_id:
        db.add(User(id=user_id, email=f"{user_id}@t.in", user_type="customer"))
        db.flush()
    o = Order(order_no=f"IDX-T-{uuid.uuid4().hex[:8]}", user_id=user_id, channel="d2c", status="pending_payment", grand_total=total)
    db.add(o)
    db.flush()
    p = Payment(order_id=o.id, gateway="razorpay", gateway_order_id=f"order_{uuid.uuid4().hex[:14]}", amount=total, status="created")
    db.add(p)
    db.commit()
    db.close()
    return o, p


# ---- OTP --------------------------------------------------------------------


def test_otp_never_returns_the_code_in_production(env, monkeypatch):
    from app.routers import auth as r

    monkeypatch.setattr(r.settings, "environment", "production")
    monkeypatch.setattr(r.settings, "otp_dev_mode", True)
    monkeypatch.setattr(r.settings, "msg91_auth_key", "")
    res = env["client"].post("/auth/otp/request", json={"phone": "9876500001"})
    assert res.status_code == 503
    assert "dev_code" not in res.text or res.json().get("dev_code") is None


def test_otp_dev_mode_shows_code_and_is_rate_limited(env, monkeypatch):
    from app.routers import auth as r

    monkeypatch.setattr(r.settings, "environment", "development")
    monkeypatch.setattr(r.settings, "otp_dev_mode", True)
    c = env["client"]
    codes = [c.post("/auth/otp/request", json={"phone": "9876500002"}) for _ in range(4)]
    assert [x.status_code for x in codes] == [200, 200, 200, 429]
    code = codes[2].json()["dev_code"]
    assert len(code) == 6 and code.isdigit()
    assert c.post("/auth/otp/verify", json={"phone": "9876500002", "code": code}).json() == {"verified": True}
    # single use
    assert c.post("/auth/otp/verify", json={"phone": "9876500002", "code": code}).status_code == 400


# ---- order and invoice access ---------------------------------------------------


def test_razorpay_order_only_for_owner_staff_or_service(env):
    owner = str(uuid.uuid4())
    o, _ = _order(env["Session"], uuid.UUID(owner))
    c, tok = env["client"], env["token"]
    body = {"order_id": str(o.id)}
    assert c.post("/payments/razorpay/order", json=body).status_code == 401
    assert c.post("/payments/razorpay/order", json=body, headers=tok(str(uuid.uuid4()), "customer")).status_code == 404
    assert c.post("/payments/razorpay/order", json=body, headers=tok(owner, "customer")).status_code == 200
    assert c.post("/payments/razorpay/order", json=body, headers=tok("web", "service")).status_code == 200


def test_invoice_generate_is_staff_only_and_reads_need_the_owner(env):
    from app.db.models import Invoice

    owner = str(uuid.uuid4())
    o, _ = _order(env["Session"], uuid.UUID(owner))
    db = env["Session"]()
    inv = Invoice(
        invoice_no=f"T/{uuid.uuid4().hex[:6]}", series_code="T", financial_year="2026-27", order_id=o.id,
        place_of_supply="09", taxable_value=199905, grand_total=209900, amount_in_words="x",
    )
    db.add(inv)
    db.commit()
    c, tok = env["client"], env["token"]
    assert c.post("/invoices/generate", json={"order_id": str(o.id)}, headers=tok(owner, "customer")).status_code == 403
    assert c.get(f"/invoices/{inv.id}", headers=tok(str(uuid.uuid4()), "customer")).status_code == 404
    assert c.get(f"/invoices/{inv.id}", headers=tok(owner, "customer")).status_code == 200
    assert c.get(f"/invoices/{inv.id}", headers=tok(str(uuid.uuid4()), "staff")).status_code == 200


# ---- webhook ------------------------------------------------------------------


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture()
def webhook(env, monkeypatch):
    from app.services.payments import razorpay_webhook as w
    from app.worker.celery_app import celery_app

    monkeypatch.setattr(w.settings, "razorpay_webhook_secret", "whsec_test")
    sent: list[tuple[str, list]] = []
    monkeypatch.setattr(celery_app, "send_task", lambda name, args=None, **k: sent.append((name, args)))

    def post(event: str, gw_order: str, amount: int, event_id: str | None = None, secret: str = "whsec_test"):
        body = json.dumps({
            "id": event_id or f"evt_{uuid.uuid4().hex[:12]}", "event": event,
            "payload": {"payment": {"entity": {"id": "pay_1", "order_id": gw_order, "amount": amount, "method": "upi"}}},
        }).encode()
        return env["client"].post("/payments/razorpay/webhook", content=body, headers={"x-razorpay-signature": _sign(secret, body), "content-type": "application/json"})

    return post, sent


def _status(env, order_id):
    from app.db.models import Order

    db = env["Session"]()
    try:
        return db.get(Order, order_id).status.value
    finally:
        db.close()


def test_webhook_rejects_bad_signature(env, webhook):
    post, sent = webhook
    o, p = _order(env["Session"])
    assert post("payment.captured", p.gateway_order_id, p.amount, secret="wrong").status_code == 400
    assert _status(env, o.id) == "pending_payment" and sent == []


def test_webhook_capture_marks_paid_once_and_queues_after_commit(env, webhook):
    post, sent = webhook
    o, p = _order(env["Session"])
    r = post("payment.captured", p.gateway_order_id, p.amount, event_id="evt_same")
    assert r.status_code == 200 and _status(env, o.id) == "paid"
    assert {n for n, _ in sent} == {"invoices.generate", "inventory.order_out", "notify.whatsapp_order_confirmed", "notify.order_confirmed_email"}
    sent.clear()
    assert post("payment.captured", p.gateway_order_id, p.amount, event_id="evt_same").json()["duplicate"] is True
    assert sent == []


def test_webhook_late_failure_does_not_undo_capture(env, webhook):
    from app.db.models import Payment

    post, _ = webhook
    o, p = _order(env["Session"])
    post("payment.captured", p.gateway_order_id, p.amount)
    assert post("payment.failed", p.gateway_order_id, p.amount).json().get("ignored") == "already_captured"
    db = env["Session"]()
    assert db.get(Payment, p.id).status.value == "captured"
    db.close()


def test_webhook_amount_mismatch_does_not_mark_paid(env, webhook):
    post, sent = webhook
    o, p = _order(env["Session"])
    post("payment.captured", p.gateway_order_id, p.amount - 100)
    assert _status(env, o.id) == "pending_payment" and sent == []


def test_no_razorpay_keys_in_production_means_no_fake_checkout(env, monkeypatch):
    from app.services.payments import razorpay_client as rc

    monkeypatch.setattr(rc.settings, "environment", "production")
    monkeypatch.setattr(rc.settings, "razorpay_key_id", "")
    owner = str(uuid.uuid4())
    o, _ = _order(env["Session"], uuid.UUID(owner))
    from app.db.models import Payment

    db = env["Session"]()
    db.query(Payment).filter(Payment.order_id == o.id).delete()
    db.commit()
    db.close()
    r = env["client"].post("/payments/razorpay/order", json={"order_id": str(o.id)}, headers=env["token"](owner, "customer"))
    assert r.status_code == 400 and r.json()["detail"] == "payments_not_configured"
