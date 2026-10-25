"""Stock sync between the inventory app and this site's ``inventory`` table.

Matching rule: an inventory-app ``sku`` matches a ``product_variants`` row whose ``sku``
OR ``barcode`` equals it (case-insensitive, trimmed). Variants with no match are left
alone; inventory-app items with no variant here are reported but not created.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Iterable

import httpx
from sqlalchemy.orm import Session

from app.db.enums import StockMovementReason
from app.db.models import Inventory, Order, ProductVariant, StockMovement, Warehouse
from app.services.inventory.client import InventoryClient, InventoryError, InventoryNotConfigured, StockItem

log = logging.getLogger(__name__)

SYNC_NOTE_PREFIX = "Synced from inventory app"


def _norm(s: str | None) -> str:
    return (s or "").strip().upper()


def match_variants(items: Iterable[StockItem], variants: Iterable[ProductVariant]) -> dict[str, ProductVariant]:
    """Map inventory-app sku -> ProductVariant using sku or barcode. Pure; unit-tested."""
    by_code: dict[str, ProductVariant] = {}
    for v in variants:
        if v.sku:
            by_code.setdefault(_norm(v.sku), v)
        if v.barcode:
            by_code.setdefault(_norm(v.barcode), v)
    out: dict[str, ProductVariant] = {}
    for it in items:
        v = by_code.get(_norm(it.sku))
        if v is not None:
            out[it.sku] = v
    return out


@dataclass
class SyncResult:
    as_of: str | None = None
    matched: int = 0
    changed: int = 0
    unmatched_skus: list[str] = field(default_factory=list)
    skipped_reason: str | None = None

    def as_dict(self) -> dict:
        return {
            "as_of": self.as_of,
            "matched": self.matched,
            "changed": self.changed,
            "unmatched": len(self.unmatched_skus),
            "unmatched_sample": self.unmatched_skus[:20],
            "skipped_reason": self.skipped_reason,
        }


def _default_warehouse(db: Session) -> Warehouse | None:
    return db.query(Warehouse).filter(Warehouse.is_active.is_(True)).order_by(Warehouse.created_at.asc()).first()


def sync_stock_from_inventory(db: Session, client: InventoryClient | None = None) -> SyncResult:
    """Pull stock levels from the inventory app and set ``inventory.on_hand`` to match.

    Every change writes an ``adjustment`` row to ``stock_movements`` so the ledger stays
    the source of truth for on_hand here, as the rest of the app expects.
    """
    result = SyncResult()
    client = client or InventoryClient()
    if not client.configured:
        result.skipped_reason = "not_configured"
        log.info("inventory.sync.skipped", extra={"reason": "INVENTORY_API_URL/INVENTORY_API_KEY unset"})
        return result

    try:
        as_of, items = client.fetch_stock()
    except InventoryNotConfigured:
        result.skipped_reason = "not_configured"
        return result
    except (httpx.HTTPError, InventoryError) as e:
        # Stock Room down or refusing the key: keep the current numbers, try again next tick.
        result.skipped_reason = "unreachable"
        log.warning("inventory.sync.unreachable", extra={"error": str(e)[:300]})
        return result
    result.as_of = as_of

    variants = db.query(ProductVariant).filter(ProductVariant.is_active.is_(True)).all()
    matched = match_variants(items, variants)
    result.matched = len(matched)
    result.unmatched_skus = [it.sku for it in items if it.sku not in matched]

    warehouse = _default_warehouse(db)
    if warehouse is None:
        result.skipped_reason = "no_active_warehouse"
        log.warning("inventory.sync.no_warehouse")
        return result

    by_sku = {it.sku: it for it in items}
    for sku, variant in matched.items():
        target = max(0, by_sku[sku].qty)
        inv = db.query(Inventory).filter(Inventory.variant_id == variant.id).first()
        if inv is None:
            inv = Inventory(variant_id=variant.id, warehouse_id=warehouse.id, on_hand=0, reserved=0, reorder_point=0)
            db.add(inv)
            db.flush()
        delta = target - int(inv.on_hand or 0)
        if delta == 0:
            continue
        inv.on_hand = target
        db.add(inv)
        db.add(
            StockMovement(
                variant_id=variant.id,
                warehouse_id=inv.warehouse_id,
                delta=delta,
                reason=StockMovementReason.adjustment,
                ref_type="inventory_sync",
                note=f"{SYNC_NOTE_PREFIX} ({as_of or 'now'}): {sku} -> {target}",
            )
        )
        result.changed += 1

    db.commit()
    log.info("inventory.sync.done", extra=result.as_dict())
    return result


def post_order_stock_out(db: Session, order: Order, client: InventoryClient | None = None) -> int:
    """Tell the inventory app a paid web order has consumed stock: one ``out`` movement per
    order item, with ``id`` = the order item id so a retried webhook cannot double-count.
    Returns the number of movements accepted (unknown SKUs are logged and skipped)."""
    client = client or InventoryClient()
    if not client.configured:
        log.info("inventory.order_out.skipped", extra={"reason": "not_configured", "order": order.order_no})
        return 0
    accepted = 0
    for item in order.items:
        variant = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).first()
        # Prefer the barcode (what the stock room prints) when set, else the variant sku.
        inv_sku = (variant.barcode if variant and variant.barcode else item.sku) or item.sku
        res = client.post_movement(
            movement_id=str(item.id if isinstance(item.id, uuid.UUID) else uuid.UUID(str(item.id))),
            sku=inv_sku,
            delta=-int(item.quantity),
            note=f"Web order {order.order_no}",
            ref=str(order.id),
        )
        if res is not None:
            accepted += 1
    return accepted
