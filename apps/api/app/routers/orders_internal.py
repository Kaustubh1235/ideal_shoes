"""Internal order endpoints called by the Next.js side for actions that touch
multiple subsystems (inventory ledger, payment row, audit log). Keep CRUD reads
in Next.js Server Actions via Prisma; only mutations that benefit from Python services
land here.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.db.models import Order, OrderItem, StockMovement
from app.db.enums import StockMovementReason
from app.db.session import get_db

router = APIRouter()


class ReserveStockIn(BaseModel):
    order_id: UUID


@router.post("/{order_id}/reserve-stock")
def reserve_stock(order_id: UUID, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)) -> dict:
    """Write reserve movements when an order moves out of draft."""
    order: Order | None = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="not_found")
    if order.status.value != "draft":
        raise HTTPException(status_code=400, detail="order_not_draft")

    items = db.query(OrderItem).filter(OrderItem.order_id == order_id).all()
    for it in items:
        mv = StockMovement(
            variant_id=it.variant_id,
            warehouse_id=_default_warehouse_id(db),
            delta=-int(it.quantity),
            reason=StockMovementReason.reserve,
            ref_type="order",
            ref_id=order.id,
            created_by=UUID(user.user_id) if user.user_id else None,
        )
        db.add(mv)
    order.status = "pending_payment"
    db.add(order)
    db.commit()
    return {"reserved": True, "items": len(items)}


def _default_warehouse_id(db: Session) -> UUID:
    """Return the default warehouse id. In v1 we have one; if none exists, error."""
    from app.db.models import Warehouse
    w = db.query(Warehouse).order_by(Warehouse.created_at).first()
    if w is None:
        raise HTTPException(status_code=500, detail="no_warehouse_configured")
    return w.id
