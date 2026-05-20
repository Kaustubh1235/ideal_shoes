"""MSG91 SMS adapter. Activates when MSG91_AUTH_KEY is set.

Until then, OTP_DEV_MODE=true logs codes to stdout (useful for local dev).
"""
from __future__ import annotations

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def _client() -> httpx.Client:
    return httpx.Client(timeout=10.0, base_url="https://control.msg91.com/api")


def send_otp_sms(phone: str, code: str) -> None:
    s = get_settings()
    if s.otp_dev_mode or not s.msg91_auth_key:
        log.info("otp.dev_mode", extra={"phone": phone, "code": code})
        return

    payload = {
        "template_id": s.msg91_template_otp,
        "short_url": "0",
        "recipients": [{"mobiles": f"91{phone}", "otp": code}],
    }
    with _client() as c:
        r = c.post(
            "/v5/flow/",
            headers={"authkey": s.msg91_auth_key, "content-type": "application/json"},
            json=payload,
        )
        r.raise_for_status()


def send_transactional_sms(phone: str, template_id: str, vars: dict[str, str]) -> None:
    s = get_settings()
    if not s.msg91_auth_key:
        log.info("sms.skipped_no_key", extra={"phone": phone, "template": template_id, "vars": vars})
        return

    recipient = {"mobiles": f"91{phone}", **vars}
    with _client() as c:
        r = c.post(
            "/v5/flow/",
            headers={"authkey": s.msg91_auth_key, "content-type": "application/json"},
            json={"template_id": template_id, "recipients": [recipient]},
        )
        r.raise_for_status()
