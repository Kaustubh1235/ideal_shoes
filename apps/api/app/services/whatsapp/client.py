"""Send approved WhatsApp template messages through the Meta Cloud API.

Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-message-templates
"""
from __future__ import annotations

import logging
import re

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v20.0"

# Template name -> ordered body parameters ({{1}}, {{2}}, ...). Register these in Meta
# Business Manager (Marketing/Utility category: "Utility", language en or hi) with the same
# names and the same number of body variables.
TEMPLATES: dict[str, list[str]] = {
    # "Hi {{1}}, we have received your IDEALX order {{2}} for ₹{{3}}. We will message you when it ships."
    "order_confirmed": ["customer_name", "order_no", "amount"],
    # "Your IDEALX order {{1}} has shipped. Track it here: {{2}}"
    "order_shipped": ["order_no", "tracking_url"],
    # "Your IDEALX order {{1}} was delivered. If the fit isn't right, exchange within 30 days: {{2}}"
    "order_delivered": ["order_no", "returns_url"],
    # "Payment of ₹{{1}} received for IDEALX order {{2}}. Thank you."
    "payment_received": ["amount", "order_no"],
}


def normalise_indian_phone(phone: str | None) -> str | None:
    """Return an E.164-ish number without '+', e.g. '919876543210'; None if unusable."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return "91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    if len(digits) == 11 and digits.startswith("0"):
        return "91" + digits[1:]
    return None


def send_template(phone: str | None, template: str, params: list[str], language: str = "en") -> bool:
    """Send one approved template message. Returns True when accepted by Meta, False when
    skipped (not configured, bad phone, unknown template) or rejected."""
    s = get_settings()
    to = normalise_indian_phone(phone)
    if template not in TEMPLATES:
        log.error("whatsapp.unknown_template", extra={"template": template})
        return False
    if len(params) != len(TEMPLATES[template]):
        log.error("whatsapp.param_count_mismatch", extra={"template": template, "got": len(params)})
        return False
    if not (s.whatsapp_phone_number_id and s.whatsapp_access_token):
        log.info("whatsapp.not_configured.skipping", extra={"template": template, "to": to})
        return False
    if not to:
        log.info("whatsapp.no_phone.skipping", extra={"template": template})
        return False

    body = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": language},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in params]},
            ],
        },
    }
    with httpx.Client(timeout=10.0, base_url=GRAPH_BASE) as c:
        r = c.post(
            f"/{s.whatsapp_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {s.whatsapp_access_token}"},
            json=body,
        )
    if r.status_code // 100 != 2:
        log.warning("whatsapp.send_failed", extra={"template": template, "status": r.status_code, "body": r.text[:300]})
        return False
    return True
