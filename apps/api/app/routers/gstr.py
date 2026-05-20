"""GSTR-1 export endpoints. Heavy work runs in Celery; this enqueues + returns job id."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthUser, require_staff
from app.db.models import GstrExportRun
from app.db.session import get_db

router = APIRouter()


class ExportIn(BaseModel):
    month: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}$")


@router.post("/r1/export")
def request_gstr1_export(
    payload: ExportIn,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_staff),
) -> dict:
    if not re.match(r"^[0-9]{4}-(0[1-9]|1[0-2])$", payload.month):
        raise HTTPException(status_code=400, detail="invalid_month")
    try:
        from app.worker.celery_app import celery_app
        async_result = celery_app.send_task("gstr.export_r1", args=[payload.month])
        return {"job_id": async_result.id, "status": "queued"}
    except Exception:
        # No worker available -- run inline (dev mode)
        from app.services.gstr.exporter import export_gstr1
        url = export_gstr1(db, payload.month)
        return {"job_id": None, "status": "done", "url": url}


@router.get("/r1/runs")
def list_runs(db: Session = Depends(get_db), _user: AuthUser = Depends(require_staff)) -> dict:
    rows = (
        db.query(GstrExportRun)
        .order_by(GstrExportRun.started_at.desc())
        .limit(50)
        .all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "report_type": r.report_type,
                "period_month": r.period_month,
                "status": r.status,
                "file_url": r.file_url,
                "row_count": r.row_count,
                "error": r.error,
                "started_at": r.started_at.isoformat(),
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            }
            for r in rows
        ],
    }
