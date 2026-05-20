"""GST tax engine -- pure functions, no DB.

compute_tax(line_items, buyer_pos, seller_pos, dealer_scheme) -> TaxResult

This is the authoritative implementation. The TS mirror in packages/gst/src/tax.ts
exists for client-side previews only.

Handles:
  - Same-state CGST + SGST split
  - Inter-state IGST
  - Reverse charge (RCM) -- tax computed but liability flips to buyer
  - Exempt / nil-rated / zero-rated / non-GST treatments
  - Per-line discount before tax
  - Composition dealers (no ITC pass-through; tax still charged to buyer at full rate
    for the SELLER side; sellers under composition scheme would not charge tax, but
    this engine is on the seller side of BharatBoot, so dealer_scheme governs the BUYER
    only and is informational here -- recorded on the invoice)
  - Bankers' rounding off at invoice level to nearest rupee
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Iterable


class TaxTreatment(str, Enum):
    TAXABLE = "TAXABLE"
    EXEMPT = "EXEMPT"
    NIL_RATED = "NIL_RATED"
    ZERO_RATED = "ZERO_RATED"  # exports / SEZ supplies
    NON_GST = "NON_GST"


class DealerScheme(str, Enum):
    REGULAR = "regular"
    COMPOSITION = "composition"
    UNREGISTERED = "unregistered"


def _q(v: Decimal) -> Decimal:
    """Round to 2 decimals using ROUND_HALF_UP (Indian GST standard)."""
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(slots=True)
class LineInput:
    """One line of an invoice."""
    description: str
    hsn_code: str
    unit_price: Decimal
    quantity: int
    gst_rate: Decimal  # e.g., Decimal("0.18")
    treatment: TaxTreatment = TaxTreatment.TAXABLE
    discount: Decimal = Decimal("0")
    cess_rate: Decimal = Decimal("0")


@dataclass(slots=True)
class LineTax:
    description: str
    hsn_code: str
    unit_price: Decimal
    quantity: int
    discount: Decimal
    taxable_value: Decimal
    gst_rate: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    cess: Decimal
    line_total: Decimal


@dataclass(slots=True)
class InvoiceTotals:
    subtotal: Decimal
    total_discount: Decimal
    taxable_value: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    igst_total: Decimal
    cess_total: Decimal
    round_off: Decimal
    grand_total: Decimal  # always an integer rupee value


@dataclass(slots=True)
class TaxResult:
    lines: list[LineTax]
    totals: InvoiceTotals
    is_inter_state: bool
    reverse_charge: bool
    dealer_scheme: DealerScheme


def is_inter_state(buyer_state_code: str, seller_state_code: str) -> bool:
    """Inter-state if state codes differ. Exports/SEZ (state_code == '96'/'97'/'99')
    are always inter-state regardless of seller's state."""
    if not buyer_state_code or not seller_state_code:
        return False
    return buyer_state_code != seller_state_code


def _compute_line(line: LineInput, inter_state: bool) -> LineTax:
    gross = Decimal(line.unit_price) * Decimal(line.quantity)
    discount = _q(Decimal(line.discount))
    taxable = _q(gross - discount)

    if line.treatment != TaxTreatment.TAXABLE:
        return LineTax(
            description=line.description,
            hsn_code=line.hsn_code,
            unit_price=_q(line.unit_price),
            quantity=line.quantity,
            discount=discount,
            taxable_value=taxable,
            gst_rate=Decimal("0"),
            cgst=Decimal("0"),
            sgst=Decimal("0"),
            igst=Decimal("0"),
            cess=Decimal("0"),
            line_total=taxable,
        )

    total_tax = _q(taxable * Decimal(line.gst_rate))
    cess = _q(taxable * Decimal(line.cess_rate))

    if inter_state:
        cgst = Decimal("0")
        sgst = Decimal("0")
        igst = total_tax
    else:
        cgst = _q(total_tax / Decimal("2"))
        sgst = _q(total_tax - cgst)  # absorb any odd-paisa here so cgst+sgst==total_tax
        igst = Decimal("0")

    return LineTax(
        description=line.description,
        hsn_code=line.hsn_code,
        unit_price=_q(line.unit_price),
        quantity=line.quantity,
        discount=discount,
        taxable_value=taxable,
        gst_rate=Decimal(line.gst_rate),
        cgst=cgst,
        sgst=sgst,
        igst=igst,
        cess=cess,
        line_total=_q(taxable + cgst + sgst + igst + cess),
    )


def compute_tax(
    lines: Iterable[LineInput],
    *,
    buyer_state_code: str,
    seller_state_code: str,
    reverse_charge: bool = False,
    dealer_scheme: DealerScheme = DealerScheme.REGULAR,
) -> TaxResult:
    """Compute taxes for a set of invoice lines.

    Args:
        lines: invoice lines
        buyer_state_code: 2-digit GST state code (place of supply)
        seller_state_code: 2-digit GST state code (seller's registered state)
        reverse_charge: True if RCM applies (buyer pays tax to govt directly)
        dealer_scheme: buyer's GST scheme; recorded on invoice
    """
    inter_state = is_inter_state(buyer_state_code, seller_state_code)
    computed = [_compute_line(line, inter_state) for line in lines]

    subtotal = sum((Decimal(l.unit_price) * Decimal(l.quantity) for l in computed), Decimal("0"))
    total_discount = sum((l.discount for l in computed), Decimal("0"))
    taxable_value = sum((l.taxable_value for l in computed), Decimal("0"))
    cgst_total = sum((l.cgst for l in computed), Decimal("0"))
    sgst_total = sum((l.sgst for l in computed), Decimal("0"))
    igst_total = sum((l.igst for l in computed), Decimal("0"))
    cess_total = sum((l.cess for l in computed), Decimal("0"))

    pre_round = taxable_value + cgst_total + sgst_total + igst_total + cess_total
    grand_total = pre_round.to_integral_value(rounding=ROUND_HALF_UP)
    round_off = _q(grand_total - pre_round)

    totals = InvoiceTotals(
        subtotal=_q(subtotal),
        total_discount=_q(total_discount),
        taxable_value=_q(taxable_value),
        cgst_total=_q(cgst_total),
        sgst_total=_q(sgst_total),
        igst_total=_q(igst_total),
        cess_total=_q(cess_total),
        round_off=round_off,
        grand_total=Decimal(grand_total),
    )

    return TaxResult(
        lines=computed,
        totals=totals,
        is_inter_state=inter_state,
        reverse_charge=reverse_charge,
        dealer_scheme=dealer_scheme,
    )


# --------------------------------------------------------------------------
# Amount in words (Indian system: lakh, crore)
# --------------------------------------------------------------------------

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
_TEENS = [
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    if n == 0:
        return ""
    if n < 10:
        return _ONES[n]
    if n < 20:
        return _TEENS[n - 10]
    return _TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")


def _three(n: int) -> str:
    h, r = divmod(n, 100)
    parts: list[str] = []
    if h:
        parts.append(f"{_ONES[h]} Hundred")
    tail = _two(r)
    if tail:
        parts.append(tail)
    return " ".join(parts)


def amount_in_words(amount: Decimal, currency: str = "Rupees") -> str:
    rounded = _q(amount)
    rupees = int(rounded)
    paise = int((rounded - rupees) * 100)

    if rupees == 0 and paise == 0:
        return f"Zero {currency} Only"

    out = ""
    n = rupees
    if n >= 10_000_000:
        out += _two(n // 10_000_000) + " Crore "
        n %= 10_000_000
    if n >= 100_000:
        out += _two(n // 100_000) + " Lakh "
        n %= 100_000
    if n >= 1000:
        out += _two(n // 1000) + " Thousand "
        n %= 1000
    if n > 0:
        out += _three(n)
    out = out.strip()

    result = f"{out} {currency}" if rupees > 0 else ""
    if paise > 0:
        result += (" and " if result else "") + _two(paise) + " Paise"
    return result + " Only"
