"""Auth endpoints exposed for the Next.js side -- OTP send/verify, internal token mint.
The Auth.js v5 flow lives in apps/web; FastAPI's role is OTP generation/verification and
issuing internal service tokens.
"""
from __future__ import annotations

import hashlib
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
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


@router.post("/otp/request", response_model=OtpResponse)
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)) -> OtpResponse:
    code = "".join(random.choices(string.digits, k=6))
    now = datetime.now(timezone.utc)
    entry = OtpCode(
        phone=payload.phone,
        code_hash=_hash_code(code),
        purpose=payload.purpose,
        expires_at=now + timedelta(minutes=10),
    )
    db.add(entry)
    db.commit()

    if settings.otp_dev_mode or not settings.msg91_auth_key:
        # dev: return code in response and log it
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
    if candidate.code_hash != code_hash:
        db.commit()
        raise HTTPException(status_code=400, detail="invalid_code")

    candidate.consumed_at = now
    db.commit()
    return {"verified": True}
