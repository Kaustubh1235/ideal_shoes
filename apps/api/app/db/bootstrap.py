"""First-run data the app cannot work without, created by the migrate job after alembic:

    python -m app.db.bootstrap

Idempotent. Today: one warehouse. Stock levels, the Stock Room sync and order reservations
all hang off a warehouse, there is no admin screen to create one, and only the demo seed did.
"""
from __future__ import annotations

from app.config import get_settings
from app.db.models import Warehouse
from app.db.session import SessionLocal


def ensure_warehouse() -> Warehouse:
    s = get_settings()
    db = SessionLocal()
    try:
        w = db.query(Warehouse).order_by(Warehouse.created_at).first()
        if w is None:
            w = Warehouse(name=f"{s.seller_trade_name} main store", gstin=s.seller_gstin or None, is_active=True)
            db.add(w)
            db.commit()
        return w
    finally:
        db.close()


if __name__ == "__main__":
    w = ensure_warehouse()
    print(f"warehouse ready: {w.name}")
