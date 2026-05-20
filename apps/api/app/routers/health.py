"""Liveness + readiness probes."""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not_ready", "error": str(e)}
