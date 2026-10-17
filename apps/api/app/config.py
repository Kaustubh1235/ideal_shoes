"""Centralised settings loaded from environment. Pydantic Settings v2."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    # Core
    environment: str = Field(default="development", validation_alias="NODE_ENV")
    log_level: str = "info"
    sentry_dsn: str | None = None

    # DB / Redis
    database_url: str
    redis_url: str = "redis://redis:6379/0"

    # Auth (shared with Next.js Auth.js v5)
    auth_secret: str
    jwt_audience: str = "bharatboot"
    jwt_issuer: str = "bharatboot-auth"

    # Razorpay
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # SMS / OTP
    msg91_auth_key: str = ""
    msg91_sender_id: str = "BHRTBT"
    msg91_template_otp: str = ""
    otp_dev_mode: bool = True

    # S3 / MinIO
    s3_endpoint: str = "http://minio:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "bharatboot"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin123"
    s3_region: str = "ap-south-1"
    s3_force_path_style: bool = True

    # SMTP
    smtp_host: str = "mailhog"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "noreply@bharatboot.local"
    smtp_tls: bool = False

    # Seller identity
    seller_gstin: str = ""
    seller_legal_name: str = "Ideal Shoes"
    seller_trade_name: str = "IDEALX"
    seller_state_code: str = "27"
    seller_address_json: str = '{"line1":"","line2":"","city":"","state":"","pincode":"","country":"India"}'
    seller_email: str = ""
    seller_phone: str = ""
    seller_financial_year: str = "2025-26"

    # E-invoicing (NIC IRP)
    irp_enabled: bool = False
    irp_base_url: str = ""
    irp_username: str = ""
    irp_password: str = ""
    irp_client_id: str = ""
    irp_client_secret: str = ""

    # E-way bill
    ewb_enabled: bool = False

    # Tender
    cppp_rss_url: str = "https://eprocure.gov.in/cppp/rss/govtprocurement_rss.xml"
    tender_inbox_host: str = ""
    tender_inbox_port: int = 993
    tender_inbox_user: str = ""
    tender_inbox_pass: str = ""
    tender_inbox_tls: bool = True

    # Shipping
    shiprocket_email: str = ""
    shiprocket_password: str = ""

    # WhatsApp
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_verify_token: str = ""

    @field_validator("seller_address_json")
    @classmethod
    def _validate_address_json(cls, v: str) -> str:
        if not v:
            return '{"line1":"","line2":"","city":"","state":"","pincode":"","country":"India"}'
        try:
            json.loads(v)
        except Exception:
            return '{"line1":"","line2":"","city":"","state":"","pincode":"","country":"India"}'
        return v

    @property
    def seller_address(self) -> dict[str, Any]:
        return json.loads(self.seller_address_json or "{}")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in ("production", "prod")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
