from __future__ import annotations

from app.services.tax.states import gstin_checksum, is_valid_gstin


def test_checksum_roundtrip():
    prefix = "27AAAPL1234C1Z"
    check = gstin_checksum(prefix)
    assert is_valid_gstin(prefix + check) is True


def test_invalid_format():
    assert is_valid_gstin("BADCODE") is False


def test_tampered_checksum_rejected():
    prefix = "27AAAPL1234C1Z"
    check = gstin_checksum(prefix)
    wrong = "B" if check == "A" else "A"
    assert is_valid_gstin(prefix + wrong) is False
