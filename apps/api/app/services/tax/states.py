"""2-digit GST state codes. Mirrors packages/gst/src/states.ts."""
from __future__ import annotations

GST_STATE_CODES: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "28": "Andhra Pradesh (Before Bifurcation)",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}


def state_name_by_code(code: str | None) -> str | None:
    if not code:
        return None
    return GST_STATE_CODES.get(code)


def is_valid_state_code(code: str) -> bool:
    return code in GST_STATE_CODES


GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def gstin_checksum(gstin14: str) -> str:
    if len(gstin14) != 14:
        raise ValueError("gstin_checksum expects 14-char input (no check digit)")
    total = 0
    for i, ch in enumerate(gstin14):
        v = GSTIN_CHARSET.index(ch)
        factor = 1 if i % 2 == 0 else 2
        product = v * factor
        total += product // 36 + product % 36
    remainder = total % 36
    return GSTIN_CHARSET[(36 - remainder) % 36]


def is_valid_gstin(gstin: str) -> bool:
    import re
    if not re.match(GSTIN_REGEX, gstin or ""):
        return False
    return gstin_checksum(gstin[:14]) == gstin[14]
