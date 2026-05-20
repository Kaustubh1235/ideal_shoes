"""Authoritative tax engine tests. Covers same-state, inter-state, exempt, reverse charge,
rounding, and Indian amount-in-words.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.tax.engine import (
    DealerScheme,
    LineInput,
    TaxTreatment,
    amount_in_words,
    compute_tax,
    is_inter_state,
)


def _l(unit: str, qty: int, rate: str, hsn: str = "6403", discount: str = "0", treatment=TaxTreatment.TAXABLE) -> LineInput:
    return LineInput(
        description="Test line",
        hsn_code=hsn,
        unit_price=Decimal(unit),
        quantity=qty,
        gst_rate=Decimal(rate),
        discount=Decimal(discount),
        treatment=treatment,
    )


def test_same_state_splits_cgst_sgst():
    r = compute_tax(
        [_l("1000", 2, "0.18")],
        buyer_state_code="27",
        seller_state_code="27",
    )
    line = r.lines[0]
    assert line.taxable_value == Decimal("2000.00")
    assert line.cgst == Decimal("180.00")
    assert line.sgst == Decimal("180.00")
    assert line.igst == Decimal("0")
    assert r.totals.grand_total == Decimal("2360")
    assert r.is_inter_state is False


def test_inter_state_uses_igst():
    r = compute_tax(
        [_l("1000", 2, "0.18")],
        buyer_state_code="07",
        seller_state_code="27",
    )
    line = r.lines[0]
    assert line.cgst == Decimal("0")
    assert line.sgst == Decimal("0")
    assert line.igst == Decimal("360.00")
    assert r.totals.grand_total == Decimal("2360")
    assert r.is_inter_state is True


def test_exempt_zeroes_tax():
    r = compute_tax(
        [_l("1000", 1, "0.18", treatment=TaxTreatment.EXEMPT)],
        buyer_state_code="07",
        seller_state_code="27",
    )
    assert r.lines[0].igst == Decimal("0")
    assert r.lines[0].line_total == Decimal("1000.00")


def test_discount_applies_before_tax():
    r = compute_tax(
        [_l("1000", 1, "0.18", discount="100")],
        buyer_state_code="27",
        seller_state_code="27",
    )
    assert r.lines[0].taxable_value == Decimal("900.00")
    assert r.lines[0].cgst == Decimal("81.00")
    assert r.lines[0].sgst == Decimal("81.00")


def test_reverse_charge_recorded():
    r = compute_tax(
        [_l("500", 1, "0.18")],
        buyer_state_code="27",
        seller_state_code="27",
        reverse_charge=True,
    )
    assert r.reverse_charge is True


def test_dealer_scheme_recorded():
    r = compute_tax(
        [_l("500", 1, "0.18")],
        buyer_state_code="27",
        seller_state_code="27",
        dealer_scheme=DealerScheme.COMPOSITION,
    )
    assert r.dealer_scheme is DealerScheme.COMPOSITION


def test_round_off_to_integer_rupee():
    r = compute_tax(
        [_l("99.50", 1, "0.18")],
        buyer_state_code="27",
        seller_state_code="27",
    )
    assert r.totals.grand_total == Decimal(round(99.5 * 1.18))


def test_is_inter_state_basic():
    assert is_inter_state("27", "07") is True
    assert is_inter_state("27", "27") is False
    assert is_inter_state("", "27") is False


@pytest.mark.parametrize(
    "amount,expected_words",
    [
        (Decimal("0"), "Zero Rupees Only"),
        (Decimal("1"), "One Rupees Only"),
        (Decimal("123.45"), "One Hundred Twenty Three Rupees and Forty Five Paise Only"),
    ],
)
def test_amount_in_words_basic(amount, expected_words):
    assert amount_in_words(amount) == expected_words


def test_amount_in_words_uses_indian_lakh_crore():
    assert "Lakh" in amount_in_words(Decimal("150000"))
    assert "Crore" in amount_in_words(Decimal("15000000"))
