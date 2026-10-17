"""High-level invoice service. Creates Invoice row + PDF + (optional) IRN.

Called from /invoices/generate router and the Celery worker.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from io import BytesIO

from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.db.models import Address, Invoice, Order, OrderItem
from app.services.invoices.numbering import current_financial_year, next_invoice_number
from app.services.invoices.pdf import render_invoice_pdf
from app.services.irp.adapter import irp_client
from app.services.storage.s3 import s3_client
from app.services.tax.engine import amount_in_words
from app.services.tax.states import state_name_by_code

log = logging.getLogger(__name__)
settings = get_settings()


def _series_for_channel(channel: str) -> tuple[str, str]:
    """Returns (series_code, prefix)."""
    if channel == "d2c":
        return "IDX-D2C", "IDX/D2C"
    if channel == "wholesale":
        return "IDX-B2B", "IDX/B2B"
    if channel == "tender":
        return "IDX-TND", "IDX/TND"
    return "IDX-MAN", "IDX/MAN"


def generate_invoice_for_order(db: Session, order_id) -> Invoice:
    """Idempotent: returns existing invoice if one is already linked to the order."""
    order: Order | None = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.invoices))
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise ValueError(f"order_not_found:{order_id}")

    if order.invoices:
        return order.invoices[0]

    if order.status.value not in ("paid", "processing", "packed", "shipped", "delivered"):
        raise ValueError(f"order_not_billable:{order.status.value}")

    series_code, prefix = _series_for_channel(order.channel.value)
    invoice_no, fy, _seq = next_invoice_number(db, series_code=series_code, prefix=prefix)

    is_inter_state = order.place_of_supply != settings.seller_state_code

    billing: Address | None = (
        db.query(Address).filter(Address.id == order.billing_address_id).first()
        if order.billing_address_id else None
    )
    shipping: Address | None = (
        db.query(Address).filter(Address.id == order.shipping_address_id).first()
        if order.shipping_address_id else None
    )

    inv = Invoice(
        invoice_no=invoice_no,
        series_code=series_code,
        financial_year=fy or current_financial_year(),
        order_id=order.id,
        buyer_gstin=order.buyer_gstin,
        place_of_supply=order.place_of_supply or settings.seller_state_code,
        reverse_charge=order.reverse_charge,
        taxable_value=order.taxable_value,
        cgst_total=order.cgst_total,
        sgst_total=order.sgst_total,
        igst_total=order.igst_total,
        cess_total=order.cess_total,
        round_off=order.round_off,
        grand_total=order.grand_total,
        amount_in_words=amount_in_words(Decimal(order.grand_total) / Decimal("100")),
        irp_status="pending" if settings.irp_enabled else "not_required",
    )
    db.add(inv)
    db.flush()  # secure invoice number

    # Render PDF
    seller = {
        "legal_name": settings.seller_legal_name,
        "trade_name": settings.seller_trade_name,
        "gstin": settings.seller_gstin,
        "address": settings.seller_address,
        "email": settings.seller_email,
        "phone": settings.seller_phone,
    }
    buyer = {
        "legal_name": order.buyer_legal_name or (billing.full_name if billing else "Customer"),
        "gstin": order.buyer_gstin,
        "billing_address": _addr_dict(billing),
        "shipping_address": _addr_dict(shipping),
        "phone": billing.phone if billing else None,
    }
    lines = [_order_item_to_line(it) for it in order.items]

    totals = {
        "subtotal": Decimal(order.subtotal) / Decimal("100"),
        "total_discount": Decimal(order.discount_total) / Decimal("100"),
        "taxable_value": Decimal(order.taxable_value) / Decimal("100"),
        "cgst_total": Decimal(order.cgst_total) / Decimal("100"),
        "sgst_total": Decimal(order.sgst_total) / Decimal("100"),
        "igst_total": Decimal(order.igst_total) / Decimal("100"),
        "cess_total": Decimal(order.cess_total) / Decimal("100"),
        "round_off": Decimal(order.round_off) / Decimal("100"),
        "grand_total": Decimal(order.grand_total) / Decimal("100"),
    }

    invoice_ctx = {
        "invoice_no": invoice_no,
        "issued_at_display": inv.issued_at.strftime("%d-%b-%Y") if inv.issued_at else "",
        "place_of_supply": inv.place_of_supply,
        "place_of_supply_name": state_name_by_code(inv.place_of_supply) or "",
        "reverse_charge": inv.reverse_charge,
        "amount_in_words": inv.amount_in_words,
        "irn": None,
        "ack_no": None,
        "ack_date_display": None,
        "signed_qr": None,
    }

    # Optional: register with IRP and capture IRN before rendering
    if settings.irp_enabled and not inv.irn and not is_b2c(order):
        try:
            irp_resp = irp_client.register_invoice(
                seller=seller,
                buyer=buyer,
                lines=lines,
                totals=totals,
                invoice_no=invoice_no,
                issued_at=inv.issued_at,
                place_of_supply=inv.place_of_supply,
            )
            inv.irn = irp_resp["irn"]
            inv.ack_no = irp_resp.get("ack_no")
            inv.ack_date = irp_resp.get("ack_date")
            inv.signed_qr = irp_resp.get("signed_qr")
            inv.irp_status = "registered"
            invoice_ctx.update(
                irn=inv.irn,
                ack_no=inv.ack_no,
                ack_date_display=inv.ack_date.strftime("%d-%b-%Y %H:%M") if inv.ack_date else "",
                signed_qr=inv.signed_qr,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("irp_registration_failed", extra={"error": str(e), "invoice_no": invoice_no})
            inv.irp_status = f"failed:{type(e).__name__}"

    pdf_bytes = render_invoice_pdf(
        {
            "invoice": invoice_ctx,
            "seller": seller,
            "buyer": buyer,
            "lines": lines,
            "totals": totals,
            "is_inter_state": is_inter_state,
        }
    )
    key = f"invoices/{fy}/{invoice_no.replace('/', '_')}.pdf"
    url = s3_client.upload_bytes(key, pdf_bytes, content_type="application/pdf")
    inv.pdf_url = url

    db.add(inv)
    db.commit()
    return inv


def is_b2c(order: Order) -> bool:
    return not order.buyer_gstin


def _addr_dict(a: Address | None) -> dict:
    if a is None:
        return {
            "line1": "", "line2": "", "city": "", "state": "",
            "state_code": "", "pincode": "", "country": "India",
        }
    return {
        "line1": a.line1,
        "line2": a.line2 or "",
        "city": a.city,
        "state": a.state,
        "state_code": a.state_code,
        "pincode": a.pincode,
        "country": a.country,
    }


def _order_item_to_line(it: OrderItem) -> dict:
    return {
        "description": it.name,
        "hsn_code": it.hsn_code,
        "quantity": it.quantity,
        "unit_price": Decimal(it.unit_price) / Decimal("100"),
        "discount": Decimal(it.discount) / Decimal("100"),
        "taxable_value": Decimal(it.taxable_value) / Decimal("100"),
        "gst_rate": Decimal(str(it.gst_rate)),
        "cgst": Decimal(it.cgst) / Decimal("100"),
        "sgst": Decimal(it.sgst) / Decimal("100"),
        "igst": Decimal(it.igst) / Decimal("100"),
        "cess": Decimal(it.cess) / Decimal("100"),
        "line_total": Decimal(it.line_total) / Decimal("100"),
    }
