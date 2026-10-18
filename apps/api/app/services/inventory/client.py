"""HTTP client for the inventory app's public API.

Contract (all paths under ``{INVENTORY_API_URL}/api/v1/public``, header ``X-API-Key``):

    GET  /stock                 -> {"asOf": iso, "items": [StockItem, ...]}
    GET  /items/{sku}           -> StockItem            (404 if unknown)
    POST /movements             -> {"item": StockItem, "movement": {...}}
         body {"id": uuid, "sku": str, "type": "out"|"in", "delta": int, "note": str, "ref": str}
         Repeating the same ``id`` returns the same result (idempotent). Unknown sku -> 404.
    GET  /summary               -> aggregates (not used by the site)

StockItem = {"sku", "brand", "article", "colour", "size", "cat", "qty", "mrp", "cost"?, "updatedAt"}
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10.0


class InventoryNotConfigured(RuntimeError):
    """Raised when the inventory link is not configured (env vars unset)."""


class InventoryError(RuntimeError):
    """Non-2xx response from the inventory app."""

    def __init__(self, status: int, body: str, path: str):
        super().__init__(f"inventory {path} -> HTTP {status}: {body[:200]}")
        self.status = status
        self.path = path


@dataclass(frozen=True)
class StockItem:
    sku: str
    qty: int
    brand: str = ""
    article: str = ""
    colour: str = ""
    size: str = ""
    cat: str = ""
    mrp: int | None = None
    cost: int | None = None
    updated_at: str | None = None

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "StockItem":
        return cls(
            sku=str(d.get("sku", "")).strip(),
            qty=int(d.get("qty") or 0),
            brand=str(d.get("brand") or ""),
            article=str(d.get("article") or ""),
            colour=str(d.get("colour") or ""),
            size=str(d.get("size") or ""),
            cat=str(d.get("cat") or ""),
            mrp=_int_or_none(d.get("mrp")),
            cost=_int_or_none(d.get("cost")),
            updated_at=d.get("updatedAt"),
        )


def _int_or_none(v: Any) -> int | None:
    try:
        return None if v is None or v == "" else int(v)
    except (TypeError, ValueError):
        return None


class InventoryClient:
    """Thin synchronous client. Construct once per task run; it owns an httpx.Client."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        settings = get_settings()
        self.base_url = (base_url if base_url is not None else settings.inventory_api_url).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.inventory_api_key
        self._client = httpx.Client(
            base_url=f"{self.base_url}/api/v1/public" if self.base_url else "",
            headers={"X-API-Key": self.api_key, "Accept": "application/json"},
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def _ensure(self) -> None:
        if not self.configured:
            raise InventoryNotConfigured("INVENTORY_API_URL / INVENTORY_API_KEY not set")

    def _raise_for_status(self, r: httpx.Response, path: str) -> None:
        if r.status_code // 100 != 2:
            raise InventoryError(r.status_code, r.text, path)

    # -- reads -----------------------------------------------------------------

    def fetch_stock(self) -> tuple[str | None, list[StockItem]]:
        self._ensure()
        r = self._client.get("/stock")
        self._raise_for_status(r, "/stock")
        data = r.json()
        items = [StockItem.from_json(x) for x in data.get("items", []) if x.get("sku")]
        return data.get("asOf"), items

    def fetch_item(self, sku: str) -> StockItem | None:
        self._ensure()
        r = self._client.get(f"/items/{sku}")
        if r.status_code == 404:
            return None
        self._raise_for_status(r, f"/items/{sku}")
        data = r.json()
        # The stock room wraps the item with its recent movements: {"item": {...}, "movements": [...]}.
        return StockItem.from_json(data.get("item", data) if isinstance(data, dict) else data)

    # -- writes ----------------------------------------------------------------

    def post_movement(
        self,
        *,
        movement_id: str,
        sku: str,
        delta: int,
        note: str,
        ref: str,
        type_: str | None = None,
    ) -> dict[str, Any] | None:
        """Record a stock movement. Returns the response body, or None when the sku is unknown
        to the inventory app (404), which callers treat as "not tracked there"."""
        self._ensure()
        body = {
            "id": movement_id,
            "sku": sku,
            "type": type_ or ("out" if delta < 0 else "in"),
            "delta": int(delta),
            "note": note,
            "ref": ref,
        }
        r = self._client.post("/movements", json=body)
        if r.status_code == 404:
            log.warning("inventory.movement.unknown_sku", extra={"sku": sku, "ref": ref})
            return None
        self._raise_for_status(r, "/movements")
        return r.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "InventoryClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
