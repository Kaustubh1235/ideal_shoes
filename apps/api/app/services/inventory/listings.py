"""Draft products from Stock Room's "Put on website" listings.

The owner adds a new article in Stock Room (photo + a line of text, filled by the AI, approved by them) and ticks
"Put on website". This module, run with the stock sync, reads those listings with the site's API key and makes
each one a **draft** product: name, description, HSN, price incl. GST, one variant per size whose SKU is the
Stock Room code (so the stock sync fills its on-hand right away), and the photo. Nothing is published: the owner
reviews the draft in Admin → Products and publishes it there.

Stock Room never writes into this site; the site pulls. The photo is decoded and re-encoded here (which drops
anything that is not pixels, metadata included) before it is stored, exactly like an upload in Admin.
"""
from __future__ import annotations

import io
import logging
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Category, Product, ProductImage, ProductVariant
from app.services.inventory.client import InventoryClient, InventoryError, InventoryNotConfigured

log = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 6 * 1024 * 1024
MAX_PHOTO_SIDE = 2000
# Stock Room's article types → the shop's categories (the owner can change it on the draft).
CATEGORY_FOR = {
    "boot": ("army_boots", "Army Boots"),
    "shoe": ("oxford_shoes", "Oxford Shoes"),
    "jacket": ("jackets", "Jackets"),
    "bag": ("accessories", "Accessories"),
    "belt": ("accessories", "Accessories"),
    "other": ("accessories", "Accessories"),
}


@dataclass
class ListingsResult:
    created: list[str] = field(default_factory=list)
    already: int = 0
    skipped: list[str] = field(default_factory=list)
    skipped_reason: str | None = None

    def as_dict(self) -> dict:
        return {
            "created": len(self.created),
            "created_ids": self.created[:20],
            "already": self.already,
            "skipped": self.skipped[:20],
            "skipped_reason": self.skipped_reason,
        }


def _text(v: Any, max_len: int) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:max_len]


def _rupees(v: Any) -> int:
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return 0
    return n if 0 < n <= 10_000_000 else 0


def _slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:120]


def clean_photo(data: bytes) -> bytes | None:
    """Decode the photo and save a fresh JPEG of its pixels; None if it is not a JPEG/PNG/WebP image."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        if fmt not in ("JPEG", "PNG", "WEBP"):
            return None
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((MAX_PHOTO_SIDE, MAX_PHOTO_SIDE))
            out = io.BytesIO()
            im.save(out, "JPEG", quality=85, optimize=True)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        return None


def _category(db: Session, cat: str) -> Category:
    slug, name = CATEGORY_FOR.get(cat, CATEGORY_FOR["other"])
    c = db.query(Category).filter(Category.slug == slug).first()
    if c is None:
        c = Category(slug=slug, name=name)
        db.add(c)
        db.flush()
    return c


def _unique(db: Session, column, base: str, max_len: int) -> str:
    base = base[:max_len] or "item"
    value, n = base, 2
    while db.query(Product).filter(column == value).first() is not None:
        suffix = f"-{n}"
        value, n = base[: max_len - len(suffix)] + suffix, n + 1
    return value


def import_listings(db: Session, client: InventoryClient | None = None, storage: Any = None) -> ListingsResult:
    """Make a draft product for every pending listing. Safe to run again: done listings are recognised."""
    result = ListingsResult()
    client = client or InventoryClient()
    if not client.configured:
        result.skipped_reason = "not_configured"
        return result
    try:
        listings = client.fetch_listings()
    except InventoryNotConfigured:
        result.skipped_reason = "not_configured"
        return result
    except (httpx.HTTPError, InventoryError) as e:
        result.skipped_reason = "unreachable"
        log.warning("inventory.listings.unreachable", extra={"error": str(e)[:300]})
        return result
    if storage is None:
        from app.services.storage.s3 import s3_client as storage

    for item in listings:
        lid = _text(item.get("id"), 64)
        try:
            product_id = _import_one(db, client, storage, item, lid, result)
        except (httpx.HTTPError, InventoryError) as e:
            db.rollback()
            result.skipped.append(lid)
            log.warning("inventory.listings.failed", extra={"listing": lid, "error": str(e)[:300]})
            continue
        if product_id:
            try:
                client.mark_listing_sent(lid, product_id)
            except (httpx.HTTPError, InventoryError) as e:
                # The product exists; next run finds it by the listing id and only repeats this call.
                log.warning("inventory.listings.mark_failed", extra={"listing": lid, "error": str(e)[:300]})
    log.info("inventory.listings.done", extra=result.as_dict())
    return result


def _import_one(
    db: Session, client: InventoryClient, storage: Any, item: dict, lid: str, result: ListingsResult
) -> str | None:
    existing = db.query(Product).filter(Product.meta_json["stockroom_listing"].astext == lid).first()
    if existing is not None:
        result.already += 1
        return str(existing.id)

    variants = [v for v in (item.get("variants") or []) if isinstance(v, dict) and _text(v.get("sku"), 60)]
    codes = [_text(v.get("sku"), 60).upper() for v in variants]
    if not codes:
        result.skipped.append(lid)
        log.warning("inventory.listings.no_variants", extra={"listing": lid})
        return None
    # A code that already sells here means this article is on the site already: point the listing at it.
    taken = db.query(ProductVariant).filter(ProductVariant.sku.in_(codes)).first()
    if taken is not None:
        result.already += 1
        return str(taken.product_id)

    price = _rupees(item.get("price"))
    hsn = _text(item.get("hsn"), 8)
    if not price or not re.fullmatch(r"[0-9]{4,8}", hsn):
        result.skipped.append(lid)
        log.warning("inventory.listings.invalid", extra={"listing": lid, "reason": "price_or_hsn"})
        return None
    mrp = _rupees(item.get("mrp")) or price
    colour = _text(item.get("colour"), 40)
    names = (item.get("brand"), item.get("article"), colour)
    title = _text(item.get("title"), 160) or " ".join(x for x in names if x and x != "-")
    # The article's code without the size: the shared start of its sizes' codes.
    prefix = codes[0] if len(codes) == 1 else re.sub(r"-[^-]*$", "", codes[0])
    sku = _unique(db, Product.sku, f"SR-{prefix}", 40)
    slug = _unique(db, Product.slug, _slugify(title) or sku.lower(), 150)

    product = Product(
        sku=sku,
        slug=slug,
        name=title,
        short_description=_text(item.get("description"), 300) or None,
        description=_text(item.get("description"), 2000) or None,
        category_id=_category(db, _text(item.get("cat"), 20)).id,
        hsn_code=hsn,
        base_price=price * 100,
        mrp=mrp * 100,
        status="draft",
        meta_json={"stockroom_listing": lid, "source": "stockroom"},
    )
    db.add(product)
    db.flush()
    for v, code in zip(variants, codes, strict=True):
        size = _text(v.get("size"), 10)
        db.add(
            ProductVariant(
                product_id=product.id,
                sku=code,
                size="Free" if size in ("", "-") else size,
                color=(colour if colour and colour != "-" else "Default")[:40],
                barcode=code,
                is_active=True,
            )
        )

    if item.get("hasPhoto"):
        raw = client.fetch_listing_photo(lid, MAX_PHOTO_BYTES)
        photo = clean_photo(raw) if raw else None
        if photo:
            url = storage.upload_bytes(f"public/product_image/{uuid.uuid4().hex}.jpg", photo, "image/jpeg")
            db.add(ProductImage(product_id=product.id, url=url, alt=title[:200], sort_order=0, is_primary=True))
        else:
            log.warning("inventory.listings.bad_photo", extra={"listing": lid})

    db.add(
        AuditLog(
            action="product.create_from_stockroom",
            entity_type="product",
            entity_id=str(product.id),
            after={"name": title, "sku": sku, "listing": lid, "variants": codes},
        )
    )
    db.commit()
    result.created.append(str(product.id))
    return str(product.id)
