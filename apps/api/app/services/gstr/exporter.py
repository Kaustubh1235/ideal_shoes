"""GSTR-1 export (B2B + B2C-large + B2C-small + HSN summary).

Produces a CSV per section. The output mirrors the structure GSTN expects when
uploading via the offline tool. A future job can convert to the JSON format
required by the GSTR-1 API.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import GstrExportRun, Invoice, Order, OrderItem
from app.services.storage.s3 import s3_client

log = logging.getLogger(__name__)


def _month_range(month: str) -> tuple[datetime, datetime]:
    y, m = month.split("-")
    start = datetime(int(y), int(m), 1)
    end = datetime(int(y) + (1 if m == "12" else 0), 1 if m == "12" else int(m) + 1, 1)
    return start, end


def export_gstr1(db: Session, month: str) -> str:
    """Generate GSTR-1 sections (B2B, B2CL, B2CS, HSN) for the given month (YYYY-MM).
    Returns the public URL of the resulting CSV bundle (one CSV per section concatenated).
    """
    start, end = _month_range(month)

    run = (
        db.query(GstrExportRun)
        .filter(GstrExportRun.report_type == "GSTR1", GstrExportRun.period_month == month)
        .first()
    )
    if run is None:
        run = GstrExportRun(report_type="GSTR1", period_month=month, status="running")
        db.add(run)
        db.flush()
    else:
        run.status = "running"
        run.error = None

    out = io.StringIO()
    writer = csv.writer(out)

    invs = (
        db.query(Invoice)
        .join(Order, Order.id == Invoice.order_id)
        .filter(Invoice.issued_at >= start, Invoice.issued_at < end, Invoice.cancelled_at.is_(None))
        .all()
    )

    # B2B section (buyer with GSTIN, all interstate or intrastate)
    writer.writerow(["# Section: B2B"])
    writer.writerow([
        "GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice Date",
        "Invoice Value", "Place Of Supply", "Reverse Charge", "Invoice Type",
        "Rate", "Taxable Value", "Cess Amount", "Cgst Amount", "Sgst Amount", "Igst Amount",
    ])
    rate_grouped: dict[tuple[str, str, str], list] = {}
    b2cl = []
    b2cs: dict[tuple[str, float], dict] = {}

    for inv in invs:
        order = inv.order
        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        if inv.buyer_gstin:
            for it in items:
                writer.writerow([
                    inv.buyer_gstin,
                    order.buyer_legal_name or "",
                    inv.invoice_no,
                    inv.issued_at.strftime("%d-%m-%Y"),
                    f"{order.grand_total / 100:.2f}",
                    inv.place_of_supply,
                    "Y" if inv.reverse_charge else "N",
                    "Regular",
                    f"{it.gst_rate * 100:.2f}",
                    f"{it.taxable_value / 100:.2f}",
                    f"{it.cess / 100:.2f}",
                    f"{it.cgst / 100:.2f}",
                    f"{it.sgst / 100:.2f}",
                    f"{it.igst / 100:.2f}",
                ])
        else:
            # B2CL: interstate + invoice value > 2.5L
            if inv.igst_total > 0 and order.grand_total >= 250000_00:
                for it in items:
                    b2cl.append([
                        inv.invoice_no, inv.issued_at.strftime("%d-%m-%Y"),
                        f"{order.grand_total / 100:.2f}", inv.place_of_supply,
                        f"{it.gst_rate * 100:.2f}",
                        f"{it.taxable_value / 100:.2f}", f"{it.cess / 100:.2f}",
                        f"{it.igst / 100:.2f}",
                    ])
            else:
                # B2CS aggregated per (place_of_supply, rate)
                for it in items:
                    key = (inv.place_of_supply, float(it.gst_rate))
                    bucket = b2cs.setdefault(
                        key,
                        {"taxable": 0, "cgst": 0, "sgst": 0, "igst": 0, "cess": 0},
                    )
                    bucket["taxable"] += it.taxable_value
                    bucket["cgst"] += it.cgst
                    bucket["sgst"] += it.sgst
                    bucket["igst"] += it.igst
                    bucket["cess"] += it.cess

    writer.writerow([])
    writer.writerow(["# Section: B2CL"])
    writer.writerow([
        "Invoice Number", "Invoice Date", "Invoice Value", "Place Of Supply",
        "Rate", "Taxable Value", "Cess Amount", "Igst Amount",
    ])
    writer.writerows(b2cl)

    writer.writerow([])
    writer.writerow(["# Section: B2CS"])
    writer.writerow([
        "Type", "Place Of Supply", "Rate", "Taxable Value",
        "Cess Amount", "Cgst Amount", "Sgst Amount", "Igst Amount",
    ])
    for (pos, rate), v in b2cs.items():
        writer.writerow([
            "OE", pos, f"{rate * 100:.2f}",
            f"{v['taxable'] / 100:.2f}",
            f"{v['cess'] / 100:.2f}",
            f"{v['cgst'] / 100:.2f}",
            f"{v['sgst'] / 100:.2f}",
            f"{v['igst'] / 100:.2f}",
        ])

    # HSN summary
    writer.writerow([])
    writer.writerow(["# Section: HSN"])
    writer.writerow([
        "HSN", "Description", "UQC", "Total Quantity", "Total Value",
        "Taxable Value", "Cess Amount", "Cgst Amount", "Sgst Amount", "Igst Amount",
    ])
    hsn_grouped: dict[str, dict] = {}
    for inv in invs:
        for it in db.query(OrderItem).filter(OrderItem.order_id == inv.order_id).all():
            bucket = hsn_grouped.setdefault(
                it.hsn_code,
                {"qty": 0, "value": 0, "taxable": 0, "cgst": 0, "sgst": 0, "igst": 0, "cess": 0},
            )
            bucket["qty"] += it.quantity
            bucket["value"] += it.line_total
            bucket["taxable"] += it.taxable_value
            bucket["cgst"] += it.cgst
            bucket["sgst"] += it.sgst
            bucket["igst"] += it.igst
            bucket["cess"] += it.cess
    for hsn, v in hsn_grouped.items():
        writer.writerow([
            hsn, "", "PCS", v["qty"],
            f"{v['value'] / 100:.2f}",
            f"{v['taxable'] / 100:.2f}",
            f"{v['cess'] / 100:.2f}",
            f"{v['cgst'] / 100:.2f}",
            f"{v['sgst'] / 100:.2f}",
            f"{v['igst'] / 100:.2f}",
        ])

    data = out.getvalue().encode("utf-8")
    key = f"gstr/{month}/GSTR1_{month}.csv"
    url = s3_client.upload_bytes(key, data, content_type="text/csv")

    run.file_url = url
    run.row_count = len(invs)
    run.status = "done"
    run.finished_at = datetime.utcnow()
    db.add(run)
    db.commit()
    return url


def export_hsn_summary(db: Session, month: str) -> str:
    return export_gstr1(db, month)
