"""Postgres ENUM definitions shared between SQLAlchemy models and migrations."""
from __future__ import annotations

import enum


class UserType(str, enum.Enum):
    customer = "customer"
    dealer = "dealer"
    staff = "staff"


class StaffRole(str, enum.Enum):
    super_admin = "super_admin"
    admin = "admin"
    ops = "ops"
    finance = "finance"
    support = "support"


class DealerStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    suspended = "suspended"
    rejected = "rejected"


class DealerGstScheme(str, enum.Enum):
    regular = "regular"
    composition = "composition"
    unregistered = "unregistered"


class OrderChannel(str, enum.Enum):
    d2c = "d2c"
    wholesale = "wholesale"
    manual = "manual"
    tender = "tender"


class OrderStatus(str, enum.Enum):
    draft = "draft"
    pending_payment = "pending_payment"
    paid = "paid"
    processing = "processing"
    packed = "packed"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"
    returned = "returned"
    refunded = "refunded"


class PaymentStatus(str, enum.Enum):
    created = "created"
    authorized = "authorized"
    captured = "captured"
    failed = "failed"
    refunded = "refunded"
    partially_refunded = "partially_refunded"


class TaxTreatment(str, enum.Enum):
    TAXABLE = "TAXABLE"
    EXEMPT = "EXEMPT"
    NIL_RATED = "NIL_RATED"
    ZERO_RATED = "ZERO_RATED"
    NON_GST = "NON_GST"


class AddressType(str, enum.Enum):
    billing = "billing"
    shipping = "shipping"
    both = "both"


class StockMovementReason(str, enum.Enum):
    purchase = "purchase"
    sale = "sale"
    return_in = "return_in"
    adjustment = "adjustment"
    transfer_in = "transfer_in"
    transfer_out = "transfer_out"
    production = "production"
    damage = "damage"
    reserve = "reserve"
    release = "release"


class TenderSource(str, enum.Enum):
    manual = "manual"
    rss_cppp = "rss_cppp"
    email = "email"
    aggregator_bidassist = "aggregator_bidassist"
    aggregator_tendersinfo = "aggregator_tendersinfo"


class TenderStatus(str, enum.Enum):
    new = "new"
    watching = "watching"
    preparing_bid = "preparing_bid"
    submitted = "submitted"
    won = "won"
    lost = "lost"
    withdrawn = "withdrawn"
    expired = "expired"
