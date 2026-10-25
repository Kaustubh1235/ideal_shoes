"""S3 / MinIO storage.

Two kinds of objects:
  * public/...  product images and AR models, readable by anyone (the bucket policy set by
    minio-init allows anonymous GET on public/ only). Stored as their public URL.
  * everything else (invoices, GSTR exports, tender attachments) is private. Stored as an
    ``s3://<bucket>/<key>`` reference and handed out as a short-lived presigned GET URL after
    an authorisation check (see routers/invoices.py and routers/gstr.py).
"""
from __future__ import annotations

from functools import cached_property

import boto3
from botocore.config import Config

from app.config import get_settings

PRIVATE_PREFIX = "s3://"


class S3Storage:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _make(self, endpoint: str):
        s = self.settings
        return boto3.client(
            "s3",
            endpoint_url=endpoint or None,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            region_name=s.s3_region,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path" if s.s3_force_path_style else "auto"},
                retries={"max_attempts": 3},
            ),
        )

    @cached_property
    def _internal(self):
        """Talks to the store from inside the Docker network."""
        return self._make(self.settings.s3_endpoint)

    @cached_property
    def _public(self):
        """Signs URLs with the host browsers can reach (signing is offline, no request is made)."""
        return self._make(self.settings.s3_public_endpoint or self.settings.s3_endpoint)

    @property
    def bucket(self) -> str:
        return self.settings.s3_bucket

    def public_url(self, key: str) -> str:
        base = (self.settings.s3_public_endpoint or self.settings.s3_endpoint).rstrip("/")
        return f"{base}/{self.bucket}/{key}"

    def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Store bytes. Returns the public URL for public/ keys, else a private s3:// reference."""
        self._internal.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        if key.startswith("public/"):
            return self.public_url(key)
        return f"{PRIVATE_PREFIX}{self.bucket}/{key}"

    def presigned_put(self, key: str, content_type: str, expires: int = 600) -> dict:
        url = self._public.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )
        out = {"url": url, "key": key, "method": "PUT", "headers": {"Content-Type": content_type}}
        if key.startswith("public/"):
            out["public_url"] = self.public_url(key)
        return out

    def presigned_get(self, ref: str, expires: int = 300, filename: str | None = None) -> str:
        """Short-lived download link for a stored reference (s3://bucket/key) or a bare key."""
        key = ref
        if ref.startswith(PRIVATE_PREFIX):
            key = ref[len(PRIVATE_PREFIX) :].split("/", 1)[1]
        params = {"Bucket": self.bucket, "Key": key}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
        return self._public.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)


s3_client = S3Storage()
