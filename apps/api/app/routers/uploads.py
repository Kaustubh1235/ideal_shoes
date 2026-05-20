"""Pre-signed upload URLs for product images and 3D .glb models."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthUser, require_staff
from app.services.storage.s3 import s3_client

router = APIRouter()


class PresignIn(BaseModel):
    purpose: str = Field(pattern=r"^(product_image|ar_model|gstr_export|invoice_pdf|misc)$")
    extension: str = Field(pattern=r"^[a-z0-9]{2,5}$")
    content_type: str


@router.post("/presign")
def presign(payload: PresignIn, user: AuthUser = Depends(require_staff)) -> dict:
    key = f"{payload.purpose}/{uuid.uuid4().hex}.{payload.extension}"
    return s3_client.presigned_put(key, payload.content_type)
