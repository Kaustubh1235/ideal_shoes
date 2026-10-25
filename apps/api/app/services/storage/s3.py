"""S3-compatible object storage (SeaweedFS in the stack; any S3 service works).

Two buckets:
  * S3_BUCKET (media): product images and AR models, readable by anyone. Keys under public/
    go here and are stored as their public URL.
  * S3_PRIVATE_BUCKET (private): invoices, GSTR exports, tender attachments. Stored as an
    ``s3://<bucket>/<key>`` reference and handed out as a short-lived presigned GET URL after
    an authorisation check (routers/invoices.py, gstr.py, tenders.py).
Anonymous read is granted on the media bucket only, by the store's config (infra/seaweedfs).
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

    @property
    def private_bucket(self) -> str:
        return self.settings.s3_private_bucket

    def ensure_buckets(self) -> None:
        existing = {b["Name"] for b in self._internal.list_buckets().get("Buckets", [])}
        for b in (self.bucket, self.private_bucket):
            if b not in existing:
                self._internal.create_bucket(Bucket=b)

    def public_url(self, key: str) -> str:
        base = (self.settings.s3_public_endpoint or self.settings.s3_endpoint).rstrip("/")
        return f"{base}/{self.bucket}/{key}"

    def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Store bytes. Returns the public URL for public/ keys, else a private s3:// reference."""
        if key.startswith("public/"):
            self._internal.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
            return self.public_url(key)
        self._internal.put_object(Bucket=self.private_bucket, Key=key, Body=data, ContentType=content_type)
        return f"{PRIVATE_PREFIX}{self.private_bucket}/{key}"

    def presigned_put(self, key: str, content_type: str, expires: int = 600) -> dict:
        bucket = self.bucket if key.startswith("public/") else self.private_bucket
        url = self._public.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )
        out = {"url": url, "key": key, "method": "PUT", "headers": {"Content-Type": content_type}}
        if key.startswith("public/"):
            out["public_url"] = self.public_url(key)
        return out

    def presigned_get(self, ref: str, expires: int = 300, filename: str | None = None) -> str:
        """Short-lived download link for a stored reference (s3://bucket/key) or a bare key."""
        bucket, key = self.private_bucket, ref
        if ref.startswith(PRIVATE_PREFIX):
            bucket, key = ref[len(PRIVATE_PREFIX) :].split("/", 1)
        params = {"Bucket": bucket, "Key": key}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
        return self._public.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)


s3_client = S3Storage()


if __name__ == "__main__":
    # python -m app.services.storage.s3  -- create the buckets (run by the migrate job).
    s3_client.ensure_buckets()
    print(f"buckets ready: {s3_client.bucket}, {s3_client.private_bucket}")
