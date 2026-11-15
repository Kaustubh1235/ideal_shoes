"""GST-compliant tax invoice PDF generation via WeasyPrint.

The template is an HTML file rendered with Jinja2, then converted to PDF.
This produces visually polished output and avoids the pain of manual PDF construction.
"""
from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATE_DIR = Path(__file__).parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _fmt_inr(v: Decimal | float | int) -> str:
    """Format a number as Indian-grouped currency, e.g., 1,23,456.78"""
    d = Decimal(v).quantize(Decimal("0.01"))
    sign = "-" if d < 0 else ""
    s = f"{abs(d):.2f}"
    int_part, dec_part = s.split(".")
    if len(int_part) <= 3:
        grouped = int_part
    else:
        # Indian grouping: last 3 digits, then groups of 2
        last3 = int_part[-3:]
        rest = int_part[:-3]
        groups: list[str] = []
        while len(rest) > 2:
            groups.append(rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.append(rest)
        groups.reverse()
        grouped = ",".join(groups) + "," + last3
    return f"{sign}₹{grouped}.{dec_part}"


_env.filters["inr"] = _fmt_inr


def render_invoice_pdf(context: dict[str, Any]) -> bytes:
    """Render the GST tax invoice to PDF bytes.

    `context` must include:
      invoice (dict with invoice_no, series, financial_year, issued_at, place_of_supply,
               reverse_charge, irn, ack_no, ack_date, signed_qr (base64 image),
               amount_in_words)
      seller (dict)
      buyer (dict)
      lines (list of dicts)
      totals (dict)
      is_inter_state (bool)
    """
    template = _env.get_template("invoice.html.j2")
    html = template.render(**context)
    buf = BytesIO()
    # Imported here: WeasyPrint loads cairo/pango at import, which only the PDF path needs.
    from weasyprint import HTML

    HTML(string=html).write_pdf(target=buf)
    return buf.getvalue()
