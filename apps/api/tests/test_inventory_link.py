"""Tests for the inventory-app link: HTTP client (httpx MockTransport) and SKU matching."""
from __future__ import annotations

import json
import os
import uuid
from types import SimpleNamespace

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AUTH_SECRET", "test-secret-test-secret")

httpx = pytest.importorskip("httpx")

from app.services.inventory.client import InventoryClient, InventoryError, StockItem  # noqa: E402
from app.services.inventory.sync import match_variants  # noqa: E402


def _client(handler) -> InventoryClient:
    return InventoryClient(
        base_url="https://stock.example.test",
        api_key="k_test",
        transport=httpx.MockTransport(handler),
    )


def test_not_configured_is_a_noop_flag():
    c = InventoryClient(base_url="", api_key="", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    assert c.configured is False


def test_fetch_stock_parses_items_and_sends_api_key():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["key"] = request.headers.get("X-API-Key")
        return httpx.Response(
            200,
            json={
                "asOf": "2026-10-18T12:00:00Z",
                "items": [
                    {"sku": "IDX-BOOT-DMS-9-BLACK", "brand": "IDEALX", "article": "DMS", "colour": "Black", "size": "9", "cat": "shoe", "qty": 12, "mrp": 3999, "updatedAt": "2026-10-18T11:59:00Z"},
                    {"sku": "", "qty": 3},  # ignored: no sku
                ],
            },
        )

    with _client(handler) as c:
        as_of, items = c.fetch_stock()
    assert seen["path"] == "/api/v1/public/stock"
    assert seen["key"] == "k_test"
    assert as_of == "2026-10-18T12:00:00Z"
    assert items == [
        StockItem(sku="IDX-BOOT-DMS-9-BLACK", qty=12, brand="IDEALX", article="DMS", colour="Black", size="9", cat="shoe", mrp=3999, cost=None, updated_at="2026-10-18T11:59:00Z")
    ]


def test_post_movement_body_and_404_means_untracked():
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if body["sku"] == "UNKNOWN":
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json={"item": {"sku": body["sku"], "qty": 11}, "movement": body})

    mid = str(uuid.uuid4())
    with _client(handler) as c:
        ok = c.post_movement(movement_id=mid, sku="IDX-BOOT-DMS-9-BLACK", delta=-1, note="Web order IDX-26-ABC", ref="order-1")
        missing = c.post_movement(movement_id=str(uuid.uuid4()), sku="UNKNOWN", delta=-1, note="x", ref="order-1")

    assert ok["item"]["qty"] == 11
    assert missing is None
    assert bodies[0] == {"id": mid, "sku": "IDX-BOOT-DMS-9-BLACK", "type": "out", "delta": -1, "note": "Web order IDX-26-ABC", "ref": "order-1"}


def test_non_2xx_raises():
    with _client(lambda r: httpx.Response(503, text="down")) as c:
        with pytest.raises(InventoryError) as ei:
            c.fetch_stock()
    assert ei.value.status == 503


def test_match_variants_by_sku_or_barcode_case_insensitive():
    variants = [
        SimpleNamespace(sku="IDX-BOOT-DMS-9-BLACK", barcode=None),
        SimpleNamespace(sku="IDX-OXF-PLAIN-8-BLACK", barcode="OXF-PLN-BLK-8"),
        SimpleNamespace(sku="IDX-JKT-FIELD-L-BLACK", barcode=None),
    ]
    items = [
        StockItem(sku="idx-boot-dms-9-black", qty=5),
        StockItem(sku="oxf-pln-blk-8 ", qty=2),
        StockItem(sku="NOT-HERE", qty=9),
    ]
    m = match_variants(items, variants)
    assert set(m) == {"idx-boot-dms-9-black", "oxf-pln-blk-8 "}
    assert m["idx-boot-dms-9-black"].sku == "IDX-BOOT-DMS-9-BLACK"
    assert m["oxf-pln-blk-8 "].sku == "IDX-OXF-PLAIN-8-BLACK"
