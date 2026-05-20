"""SQLAlchemy 2.x models. SOURCE OF TRUTH for the database schema.
Run `alembic revision --autogenerate` after editing, then `alembic upgrade head`,
then `pnpm prisma:pull` to mirror into Prisma for the TS side.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum as PgEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import (
    AddressType,
    DealerGstScheme,
    DealerStatus,
    OrderChannel,
    OrderStatus,
    PaymentStatus,
    StaffRole,
    StockMovementReason,
    TaxTreatment,
    TenderSource,
    TenderStatus,
    UserType,
)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _ts() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ---------------------------------------------------------------------------
# Users / Auth
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _pk()
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_type: Mapped[UserType] = mapped_column(PgEnum(UserType, name="user_type"), nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    customer: Mapped["CustomerProfile | None"] = relationship(back_populates="user", uselist=False)
    dealer: Mapped["DealerProfile | None"] = relationship(back_populates="user", uselist=False)
    staff: Mapped["StaffProfile | None"] = relationship(back_populates="user", uselist=False)
    addresses: Mapped[list["Address"]] = relationship(back_populates="user")
    orders: Mapped[list["Order"]] = relationship(back_populates="user")
    carts: Mapped[list["Cart"]] = relationship(back_populates="user")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user")

    __table_args__ = (Index("ix_users_user_type", "user_type"),)


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    dob: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    default_address_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = _ts()

    user: Mapped[User] = relationship(back_populates="customer")


class DealerProfile(Base):
    __tablename__ = "dealer_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    gstin: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    pan: Mapped[str] = mapped_column(String(10), nullable=False)
    gst_scheme: Mapped[DealerGstScheme] = mapped_column(
        PgEnum(DealerGstScheme, name="dealer_gst_scheme"),
        default=DealerGstScheme.regular,
        nullable=False,
    )
    status: Mapped[DealerStatus] = mapped_column(
        PgEnum(DealerStatus, name="dealer_status"), default=DealerStatus.pending, nullable=False
    )
    price_tier: Mapped[str] = mapped_column(String(20), default="tier_b", nullable=False)
    credit_limit: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    credit_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    years_in_business: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_monthly_order_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts()

    user: Mapped[User] = relationship(back_populates="dealer")

    __table_args__ = (Index("ix_dealer_profiles_status", "status"),)


class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[StaffRole] = mapped_column(PgEnum(StaffRole, name="staff_role"), nullable=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ip_allowlist: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()

    user: Mapped[User] = relationship(back_populates="staff")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()

    user: Mapped[User] = relationship(back_populates="sessions")

    __table_args__ = (Index("ix_sessions_user_id", "user_id"),)


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[uuid.UUID] = _pk()
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = _ts()

    __table_args__ = (Index("ix_otp_codes_phone_purpose", "phone", "purpose"),)


# ---------------------------------------------------------------------------
# Address / Warehouse
# ---------------------------------------------------------------------------

class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    line1: Mapped[str] = mapped_column(String(200), nullable=False)
    line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    state_code: Mapped[str] = mapped_column(String(2), nullable=False)
    pincode: Mapped[str] = mapped_column(String(10), nullable=False)
    country: Mapped[str] = mapped_column(String(80), default="India", nullable=False)
    landmark: Mapped[str | None] = mapped_column(String(120), nullable=True)
    type: Mapped[AddressType] = mapped_column(
        PgEnum(AddressType, name="address_type"), default=AddressType.both, nullable=False
    )
    created_at: Mapped[datetime] = _ts()

    user: Mapped[User | None] = relationship(back_populates="addresses")

    __table_args__ = (Index("ix_addresses_user_id", "user_id"),)


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    address_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _ts()

    inventory: Mapped[list["Inventory"]] = relationship(back_populates="warehouse")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="warehouse")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="warehouse")


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = _pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = _pk()
    sku: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True
    )
    hsn_code: Mapped[str] = mapped_column(String(8), nullable=False)
    tax_treatment: Mapped[TaxTreatment] = mapped_column(
        PgEnum(TaxTreatment, name="tax_treatment"),
        default=TaxTreatment.TAXABLE,
        nullable=False,
    )
    base_price: Mapped[int] = mapped_column(Integer, nullable=False)
    mrp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    ar_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ar_model_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    category: Mapped[Category | None] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product")
    images: Mapped[list["ProductImage"]] = relationship(back_populates="product")

    __table_args__ = (
        Index("ix_products_status", "status"),
        Index("ix_products_category_id", "category_id"),
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[uuid.UUID] = _pk()
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    sku: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    size: Mapped[str] = mapped_column(String(10), nullable=False)
    color: Mapped[str] = mapped_column(String(40), nullable=False)
    attributes: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    price_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _ts()

    product: Mapped[Product] = relationship(back_populates="variants")

    __table_args__ = (Index("ix_product_variants_product_id", "product_id"),)


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[uuid.UUID] = _pk()
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = _ts()

    product: Mapped[Product] = relationship(back_populates="images")


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

class Inventory(Base):
    __tablename__ = "inventory"

    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=False
    )
    on_hand: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reorder_point: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    warehouse: Mapped[Warehouse] = relationship(back_populates="inventory")


class StockMovement(Base):
    """Append-only ledger. Inventory.on_hand is a projection of this."""
    __tablename__ = "stock_movements"

    id: Mapped[uuid.UUID] = _pk()
    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=False
    )
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[StockMovementReason] = mapped_column(
        PgEnum(StockMovementReason, name="stock_movement_reason"), nullable=False
    )
    ref_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = _ts()

    warehouse: Mapped[Warehouse] = relationship(back_populates="stock_movements")

    __table_args__ = (
        Index("ix_stock_movements_variant_created", "variant_id", "created_at"),
        Index("ix_stock_movements_ref", "ref_type", "ref_id"),
    )


# ---------------------------------------------------------------------------
# Cart / Order / Payment
# ---------------------------------------------------------------------------

class Cart(Base):
    __tablename__ = "carts"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    anon_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    channel: Mapped[OrderChannel] = mapped_column(
        PgEnum(OrderChannel, name="order_channel"), default=OrderChannel.d2c, nullable=False
    )
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User | None] = relationship(back_populates="carts")
    items: Mapped[list["CartItem"]] = relationship(back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[uuid.UUID] = _pk()
    cart_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carts.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = _ts()

    cart: Mapped[Cart] = relationship(back_populates="items")

    __table_args__ = (UniqueConstraint("cart_id", "variant_id", name="uq_cart_items_cart_variant"),)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = _pk()
    order_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    channel: Mapped[OrderChannel] = mapped_column(
        PgEnum(OrderChannel, name="order_channel"), nullable=False
    )
    status: Mapped[OrderStatus] = mapped_column(
        PgEnum(OrderStatus, name="order_status"), default=OrderStatus.draft, nullable=False
    )
    billing_address_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    shipping_address_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    buyer_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    buyer_legal_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    place_of_supply: Mapped[str | None] = mapped_column(String(2), nullable=True)
    reverse_charge: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    taxable_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cgst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sgst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    igst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cess_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shipping_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    discount_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    round_off: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    grand_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    placed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User | None] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="order")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="order")

    __table_args__ = (
        Index("ix_orders_user_id", "user_id"),
        Index("ix_orders_status", "status"),
        Index("ix_orders_channel_created", "channel", "created_at"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = _pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False
    )
    sku: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    hsn_code: Mapped[str] = mapped_column(String(8), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    discount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    taxable_value: Mapped[int] = mapped_column(Integer, nullable=False)
    gst_rate: Mapped[float] = mapped_column(Float, nullable=False)
    cgst: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sgst: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    igst: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cess: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    line_total: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")

    __table_args__ = (Index("ix_order_items_order_id", "order_id"),)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = _pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    gateway: Mapped[str] = mapped_column(String(40), default="razorpay", nullable=False)
    gateway_order_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        PgEnum(PaymentStatus, name="payment_status"), default=PaymentStatus.created, nullable=False
    )
    method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    order: Mapped[Order] = relationship(back_populates="payments")
    events: Mapped[list["PaymentEvent"]] = relationship(back_populates="payment")

    __table_args__ = (
        Index("ix_payments_order_id", "order_id"),
        Index("ix_payments_gateway_order_id", "gateway_order_id"),
    )


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id: Mapped[uuid.UUID] = _pk()
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True
    )
    gateway: Mapped[str] = mapped_column(String(40), default="razorpay", nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    received_at: Mapped[datetime] = _ts()

    payment: Mapped[Payment | None] = relationship(back_populates="events")

    __table_args__ = (Index("ix_payment_events_gateway_type", "gateway", "event_type"),)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    scope: Mapped[str] = mapped_column(String(80), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="processing", nullable=False)
    created_at: Mapped[datetime] = _ts()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_idempotency_keys_expires_at", "expires_at"),)


# ---------------------------------------------------------------------------
# Invoicing
# ---------------------------------------------------------------------------

class InvoiceSeries(Base):
    __tablename__ = "invoice_series"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    financial_year: Mapped[str] = mapped_column(String(7), primary_key=True)
    prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    next_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = _pk()
    invoice_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    series_code: Mapped[str] = mapped_column(String(40), nullable=False)
    financial_year: Mapped[str] = mapped_column(String(7), nullable=False)
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False
    )
    buyer_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    place_of_supply: Mapped[str] = mapped_column(String(2), nullable=False)
    reverse_charge: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    taxable_value: Mapped[int] = mapped_column(Integer, nullable=False)
    cgst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sgst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    igst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cess_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    round_off: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    grand_total: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_in_words: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    irn: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    ack_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ack_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_qr: Mapped[str | None] = mapped_column(Text, nullable=True)
    irp_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    issued_at: Mapped[datetime] = _ts()
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship(back_populates="invoices")
    credit_notes: Mapped[list["CreditNote"]] = relationship(back_populates="invoice")

    __table_args__ = (Index("ix_invoices_fy_series", "financial_year", "series_code"),)


class CreditNote(Base):
    __tablename__ = "credit_notes"

    id: Mapped[uuid.UUID] = _pk()
    cn_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    taxable_value: Mapped[int] = mapped_column(Integer, nullable=False)
    cgst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sgst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    igst_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    issued_at: Mapped[datetime] = _ts()

    invoice: Mapped[Invoice] = relationship(back_populates="credit_notes")


# ---------------------------------------------------------------------------
# Shipment / Returns
# ---------------------------------------------------------------------------

class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[uuid.UUID] = _pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False
    )
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=True
    )
    courier: Mapped[str | None] = mapped_column(String(60), nullable=True)
    awb: Mapped[str | None] = mapped_column(String(60), nullable=True)
    eway_bill_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    eway_bill_valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="created", nullable=False)
    tracking_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()

    order: Mapped[Order] = relationship(back_populates="shipments")
    warehouse: Mapped[Warehouse | None] = relationship(back_populates="shipments")

    __table_args__ = (Index("ix_shipments_order_id", "order_id"),)


class ReturnRequest(Base):
    __tablename__ = "return_requests"

    id: Mapped[uuid.UUID] = _pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="requested", nullable=False)
    items_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    refund_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


# ---------------------------------------------------------------------------
# Dealer / Wholesale
# ---------------------------------------------------------------------------

class DealerPriceList(Base):
    __tablename__ = "dealer_price_lists"

    id: Mapped[uuid.UUID] = _pk()
    tier: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _ts()


class DealerPriceListEntry(Base):
    __tablename__ = "dealer_price_list_entries"

    id: Mapped[uuid.UUID] = _pk()
    price_list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dealer_price_lists.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False
    )
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    min_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = _ts()

    __table_args__ = (
        UniqueConstraint(
            "price_list_id", "variant_id", "min_quantity",
            name="uq_dealer_price_list_entries_unique",
        ),
    )


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[uuid.UUID] = _pk()
    quote_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    dealer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False)
    items_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_total: Mapped[int] = mapped_column(Integer, nullable=False)
    grand_total: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    converted_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts()


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = _pk()
    po_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(40), default="draft", nullable=False)
    items_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_total: Mapped[int] = mapped_column(Integer, nullable=False)
    grand_total: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts()


# ---------------------------------------------------------------------------
# Tender / Audit
# ---------------------------------------------------------------------------

class Tender(Base):
    __tablename__ = "tenders"

    id: Mapped[uuid.UUID] = _pk()
    source: Mapped[TenderSource] = mapped_column(
        PgEnum(TenderSource, name="tender_source"), nullable=False
    )
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    buyer_org: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submission_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opening_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    emd: Mapped[float | None] = mapped_column(Float, nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    product_match: Mapped[list[str] | None] = mapped_column(ARRAY(String(40)), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_urls: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[TenderStatus] = mapped_column(
        PgEnum(TenderStatus, name="tender_status"), default=TenderStatus.new, nullable=False
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_tenders_source_external"),
        Index("ix_tenders_status", "status"),
        Index("ix_tenders_source", "source"),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = _pk()
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _ts()

    __table_args__ = (
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_audit_log_actor", "actor_user_id"),
    )


class GstrExportRun(Base):
    __tablename__ = "gstr_export_runs"

    id: Mapped[uuid.UUID] = _pk()
    report_type: Mapped[str] = mapped_column(String(20), nullable=False)
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = _ts()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("report_type", "period_month", name="uq_gstr_export_runs_report_period"),
    )
