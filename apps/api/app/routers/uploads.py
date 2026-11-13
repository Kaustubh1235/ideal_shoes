"""Pre-signed upload URLs for product images and 3D .glb models."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
    # Images and AR models are shown on the storefront, so they go under the public prefix.
    prefix = "public/" if payload.purpose in ("product_image", "ar_model") else ""
    key = f"{prefix}{payload.purpose}/{uuid.uuid4().hex}.{payload.extension}"
    return s3_client.presigned_put(key, payload.content_type)


IMAGE_TYPES = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"), "WEBP": ("webp", "image/webp")}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/product-image")
async def upload_product_image(file: UploadFile = File(...), user: AuthUser = Depends(require_staff)) -> dict:
    """Store a product photo in the public bucket and return its URL. The admin product page
    sends the file here; the type is taken from the decoded image, not from the file name."""
    import io

    from PIL import Image, UnidentifiedImageError

    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image_too_large")
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            im.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as e:
        raise HTTPException(status_code=400, detail="not_an_image") from e
    if fmt not in IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="use_jpeg_png_or_webp")
    ext, content_type = IMAGE_TYPES[fmt]
    key = f"public/product_image/{uuid.uuid4().hex}.{ext}"
    return {"url": s3_client.upload_bytes(key, data, content_type), "key": key}
