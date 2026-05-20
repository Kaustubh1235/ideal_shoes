"""NIC Invoice Registration Portal (IRP) adapter.

This is the GSP-mediated route used by businesses with >₹5 cr turnover.
Until the user completes GSP onboarding (ClearTax / Masters India / Cygnet / etc.)
and sets IRP_* env vars, this adapter logs and returns no-op.

Real flow:
  1. Auth: POST /eivital/v1.04/auth with username/password + client creds -> AuthToken + sek
  2. Generate IRN: POST /eicore/v1.03/Invoice with JSON in IRP schema -> Irn, AckNo, AckDt, SignedQRCode
  3. Cancel: POST /eicore/v1.03/Invoice/Cancel within 24h

We use Tenacity for retry. SignedQRCode comes back as a base64 PNG inside the response;
we re-emit it embedded in the invoice PDF.
"""
from __future__ import annotations

import base64
import io
import logging
from datetime import datetime
from typing import Any

import httpx
import qrcode
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

log = logging.getLogger(__name__)


class IrpNotConfigured(Exception):
    pass


class IrpAdapter:
    def __init__(self):
        self.s = get_settings()

    @property
    def enabled(self) -> bool:
        return (
            self.s.irp_enabled
            and bool(self.s.irp_base_url)
            and bool(self.s.irp_username)
            and bool(self.s.irp_password)
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _auth(self) -> dict[str, str]:
        if not self.enabled:
            raise IrpNotConfigured("irp_not_configured")
        with httpx.Client(base_url=self.s.irp_base_url, timeout=15.0) as c:
            r = c.post(
                "/eivital/v1.04/auth",
                json={
                    "UserName": self.s.irp_username,
                    "Password": self.s.irp_password,
                    "AppKey": self.s.irp_client_id,
                    "ForceRefreshAccessToken": False,
                },
                headers={"client_id": self.s.irp_client_id, "client_secret": self.s.irp_client_secret},
            )
            r.raise_for_status()
            return r.json()["Data"]

    def register_invoice(
        self,
        *,
        seller: dict,
        buyer: dict,
        lines: list[dict],
        totals: dict,
        invoice_no: str,
        issued_at: datetime,
        place_of_supply: str,
    ) -> dict[str, Any]:
        """Returns dict with `irn`, `ack_no`, `ack_date`, `signed_qr` (base64 PNG)."""
        if not self.enabled:
            # Generate a local fallback QR with the basic invoice details so the PDF
            # still has a scannable code. NOT a real IRN -- clearly labelled "DEV".
            qr_payload = {
                "seller_gstin": seller.get("gstin"),
                "buyer_gstin": buyer.get("gstin"),
                "invoice_no": invoice_no,
                "issued_at": issued_at.isoformat() if issued_at else "",
                "grand_total": str(totals.get("grand_total")),
                "dev": True,
            }
            qr_b64 = _qr_b64(str(qr_payload))
            return {
                "irn": None,
                "ack_no": None,
                "ack_date": None,
                "signed_qr": qr_b64,
            }

        token = self._auth()["AuthToken"]
        payload = _build_irp_payload(
            seller=seller, buyer=buyer, lines=lines, totals=totals,
            invoice_no=invoice_no, issued_at=issued_at, place_of_supply=place_of_supply,
        )
        with httpx.Client(base_url=self.s.irp_base_url, timeout=20.0) as c:
            r = c.post(
                "/eicore/v1.03/Invoice",
                headers={
                    "client_id": self.s.irp_client_id,
                    "client_secret": self.s.irp_client_secret,
                    "AuthToken": token,
                    "gstin": seller.get("gstin", ""),
                },
                json=payload,
            )
            r.raise_for_status()
            data = r.json().get("Data") or {}

        return {
            "irn": data.get("Irn"),
            "ack_no": data.get("AckNo"),
            "ack_date": _parse_ack_dt(data.get("AckDt")),
            "signed_qr": data.get("SignedQRCode"),
        }


def _qr_b64(content: str) -> str:
    img = qrcode.make(content)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _parse_ack_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _build_irp_payload(*, seller, buyer, lines, totals, invoice_no, issued_at, place_of_supply) -> dict:
    """Minimal IRP-schema payload. Real production should validate against NIC schema."""
    return {
        "Version": "1.1",
        "TranDtls": {"TaxSch": "GST", "SupTyp": "B2B" if buyer.get("gstin") else "B2C"},
        "DocDtls": {
            "Typ": "INV",
            "No": invoice_no,
            "Dt": (issued_at or datetime.utcnow()).strftime("%d/%m/%Y"),
        },
        "SellerDtls": {
            "Gstin": seller["gstin"],
            "LglNm": seller["legal_name"],
            "Addr1": seller["address"]["line1"],
            "Loc": seller["address"]["city"],
            "Pin": int(seller["address"]["pincode"] or 0),
            "Stcd": seller["address"]["state_code"] if "state_code" in seller["address"] else "27",
        },
        "BuyerDtls": {
            "Gstin": buyer.get("gstin") or "URP",
            "LglNm": buyer["legal_name"],
            "Pos": place_of_supply,
            "Addr1": buyer["billing_address"]["line1"],
            "Loc": buyer["billing_address"]["city"],
            "Pin": int(buyer["billing_address"]["pincode"] or 0),
            "Stcd": buyer["billing_address"]["state_code"],
        },
        "ItemList": [
            {
                "SlNo": str(i + 1),
                "PrdDesc": line["description"][:300],
                "HsnCd": line["hsn_code"],
                "Qty": float(line["quantity"]),
                "Unit": "PCS",
                "UnitPrice": float(line["unit_price"]),
                "TotAmt": float(line["unit_price"]) * float(line["quantity"]),
                "Discount": float(line["discount"]),
                "AssAmt": float(line["taxable_value"]),
                "GstRt": float(line["gst_rate"]) * 100,
                "CgstAmt": float(line["cgst"]),
                "SgstAmt": float(line["sgst"]),
                "IgstAmt": float(line["igst"]),
                "TotItemVal": float(line["line_total"]),
            }
            for i, line in enumerate(lines)
        ],
        "ValDtls": {
            "AssVal": float(totals["taxable_value"]),
            "CgstVal": float(totals["cgst_total"]),
            "SgstVal": float(totals["sgst_total"]),
            "IgstVal": float(totals["igst_total"]),
            "TotInvVal": float(totals["grand_total"]),
            "RndOffAmt": float(totals["round_off"]),
        },
    }


irp_client = IrpAdapter()
