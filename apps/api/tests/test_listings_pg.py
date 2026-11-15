"""Draft products from Stock Room's "Put on website" listings (app/services/inventory/listings.py).

Needs Postgres (JSONB): runs when TEST_DATABASE_URL is set, skipped otherwise. The Stock Room API is an
httpx MockTransport and storage is a fake, so nothing leaves the test.
"""
from __future__ import annotations

import io
import json
import os

import pytest

PG = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not PG, reason="needs TEST_DATABASE_URL (Postgres)")

if PG:
    os.environ["DATABASE_URL"] = PG
os.environ.setdefault("AUTH_SECRET", "test-secret-test-secret")

httpx = pytest.importorskip("httpx")


def _jpeg_with_exif() -> bytes:
    from PIL import Image

    im = Image.new("RGB", (64, 48), (120, 30, 40))
    exif = Image.Exif()
    exif[0x010F] = "SecretPhoneMaker"  # camera make: must not survive
    out = io.BytesIO()
    im.save(out, "JPEG", exif=exif)
    return out.getvalue()


LISTING = {
    "id": "8d6f0c1e-1111-4a1e-9c7d-2e8f6a4b1c90",
    "title": "Bata Formal Oxford – Black",
    "description": "Black leather oxford for office wear.",
    "hsn": "6403",
    "price": 1399,
    "mrp": 1499,
    "cat": "shoe",
    "brand": "Bata",
    "article": "Formal Oxford",
    "colour": "Black",
    "hasPhoto": True,
    "variants": [{"sku": "BATA-FORMALOX-BLA-7", "size": "7", "qty": 2}, {"sku": "BATA-FORMALOX-BLA-8", "size": "8", "qty": 3}],
}


@pytest.fixture()
def env():
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import close_all_sessions, sessionmaker

    from app.db import models  # noqa: F401
    from app.db.base import Base

    engine = create_engine(PG.replace("postgresql://", "postgresql+psycopg://", 1))
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    # An open session holds table locks; the next test's DROP SCHEMA would wait for it forever.
    close_all_sessions()
    engine.dispose()


class FakeStorage:
    def __init__(self):
        self.saved: dict[str, bytes] = {}

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        assert content_type == "image/jpeg"
        self.saved[key] = data
        return f"https://idealx.test/media/{key}"


def _client(listings, photo=b"", calls=None):
    from app.services.inventory.client import InventoryClient

    calls = calls if calls is not None else []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append((req.method, req.url.path, req.content.decode() if req.content else ""))
        if req.url.path.endswith("/listings"):
            return httpx.Response(200, json={"listings": listings})
        if req.url.path.endswith("/photo"):
            return httpx.Response(200, content=photo, headers={"content-type": "image/jpeg"})
        if req.url.path.endswith("/sent"):
            return httpx.Response(200, json={"listing": {"status": "sent"}})
        return httpx.Response(404)

    return InventoryClient(base_url="https://stock.test", api_key="k", transport=httpx.MockTransport(handler)), calls


def test_a_listing_becomes_a_draft_product_with_its_sizes_and_a_clean_photo(env):
    from PIL import Image

    from app.db.models import Product, ProductImage, ProductVariant
    from app.services.inventory.listings import import_listings

    client, calls = _client([LISTING], _jpeg_with_exif())
    storage = FakeStorage()
    db = env()
    r = import_listings(db, client, storage)
    assert len(r.created) == 1 and not r.skipped

    p = db.query(Product).one()
    assert (p.status, p.name, p.hsn_code, p.base_price, p.mrp) == ("draft", "Bata Formal Oxford – Black", "6403", 139900, 149900)
    assert p.meta_json["stockroom_listing"] == LISTING["id"]
    vs = sorted((v.sku, v.size, v.color, v.barcode) for v in db.query(ProductVariant).all())
    assert vs == [("BATA-FORMALOX-BLA-7", "7", "Black", "BATA-FORMALOX-BLA-7"), ("BATA-FORMALOX-BLA-8", "8", "Black", "BATA-FORMALOX-BLA-8")]

    img = db.query(ProductImage).one()
    assert img.is_primary and img.url.startswith("https://idealx.test/media/public/product_image/")
    stored = next(iter(storage.saved.values()))
    with Image.open(io.BytesIO(stored)) as im:
        assert im.format == "JPEG" and 0x010F not in im.getexif()  # re-encoded: the phone's metadata is gone

    sent = [c for c in calls if c[1].endswith("/sent")]
    assert json.loads(sent[0][2]) == {"productId": str(p.id)}


def test_running_again_makes_no_second_product(env):
    from app.db.models import Product
    from app.services.inventory.listings import import_listings

    db = env()
    import_listings(db, _client([LISTING], _jpeg_with_exif())[0], FakeStorage())
    again = import_listings(db, _client([LISTING], _jpeg_with_exif())[0], FakeStorage())
    assert again.already == 1 and not again.created
    assert db.query(Product).count() == 1


def test_something_that_is_not_a_photo_is_not_stored(env):
    from app.db.models import Product, ProductImage
    from app.services.inventory.listings import import_listings

    storage = FakeStorage()
    db = env()
    import_listings(db, _client([LISTING], b"<svg onload=alert(1)>")[0], storage)
    assert db.query(Product).count() == 1  # the draft is still made, just without a photo
    assert db.query(ProductImage).count() == 0 and not storage.saved


def test_a_listing_without_price_or_hsn_is_skipped_and_left_pending(env):
    from app.db.models import Product
    from app.services.inventory.listings import import_listings

    bad = {**LISTING, "id": "8d6f0c1e-2222-4a1e-9c7d-2e8f6a4b1c90", "hsn": "64"}
    client, calls = _client([bad])
    db = env()
    r = import_listings(db, client, FakeStorage())
    assert r.skipped == [bad["id"]]
    assert db.query(Product).count() == 0
    assert not [c for c in calls if c[1].endswith("/sent")]


def test_without_the_stock_room_link_nothing_happens(env):
    from app.services.inventory.client import InventoryClient
    from app.services.inventory.listings import import_listings

    c = InventoryClient(base_url="", api_key="", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    assert import_listings(env(), c, FakeStorage()).skipped_reason == "not_configured"
