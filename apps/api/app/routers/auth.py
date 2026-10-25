"""Auth endpoints exposed for the Next.js side -- OTP send/verify, internal token mint.
The Auth.js v5 flow lives in apps/web; FastAPI's role is OTP generation/verification and
issuing internal service tokens.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.db.models import OtpCode
from app.services.sms.msg91 import send_otp_sms

router = APIRouter()
settings = get_settings()


class OtpRequest(BaseModel):
    phone: str = Field(pattern=r"^[6-9][0-9]{9}$")
    purpose: str = Field(default="login", max_length=40)


class OtpResponse(BaseModel):
    sent: bool
    dev_code: str | None = None  # exposed in dev-mode only


class OtpVerify(BaseModel):
    phone: str = Field(pattern=r"^[6-9][0-9]{9}$")
    code: str = Field(pattern=r"^[0-9]{6}$")
    purpose: str = "login"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


# Each request may send an SMS, which costs money and can be abused to spam a number.
OTP_PER_PHONE_10MIN = 3
OTP_PER_PHONE_DAY = 10


@router.post("/otp/request", response_model=OtpResponse)
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)) -> OtpResponse:
    now = datetime.now(timezone.utc)

    def sent_since(delta: timedelta) -> int:
        return (
            db.query(func.count(OtpCode.id))
            .filter(OtpCode.phone == payload.phone, OtpCode.created_at > now - delta)
            .scalar()
            or 0
        )

    if sent_since(timedelta(minutes=10)) >= OTP_PER_PHONE_10MIN or sent_since(timedelta(days=1)) >= OTP_PER_PHONE_DAY:
        raise HTTPException(status_code=429, detail="too_many_otp_requests")

    # Showing the code instead of sending it is for local development only. In production a
    # missing SMS key must fail closed, or anyone could sign in as any phone number.
    dev = settings.otp_dev_mode and not settings.is_production
    if not dev and not settings.msg91_auth_key:
        raise HTTPException(status_code=503, detail="sms_not_configured")

    code = f"{secrets.randbelow(10**6):06d}"
    entry = OtpCode(
        phone=payload.phone,
        code_hash=_hash_code(code),
        purpose=payload.purpose,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(entry)
    db.commit()

    if dev:
        print(f"[OTP] phone={payload.phone} code={code} purpose={payload.purpose}")
        return OtpResponse(sent=True, dev_code=code)

    send_otp_sms(payload.phone, code)
    return OtpResponse(sent=True)


@router.post("/otp/verify")
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)) -> dict:
    code_hash = _hash_code(payload.code)
    now = datetime.now(timezone.utc)
    candidate: OtpCode | None = (
        db.query(OtpCode)
        .filter(
            OtpCode.phone == payload.phone,
            OtpCode.purpose == payload.purpose,
            OtpCode.consumed_at.is_(None),
            OtpCode.expires_at > now,
        )
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if not candidate:
        raise HTTPException(status_code=400, detail="no_active_otp")

    if candidate.attempts >= 5:
        raise HTTPException(status_code=429, detail="too_many_attempts")

    candidate.attempts += 1
    if not secrets.compare_digest(candidate.code_hash, code_hash):
        db.commit()
        raise HTTPException(status_code=400, detail="invalid_code")

    candidate.consumed_at = now
    db.commit()
    return {"verified": True}
