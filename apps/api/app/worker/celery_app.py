"""Celery app + beat schedule."""
from __future__ import annotations

import logging

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()
log = logging.getLogger(__name__)

celery_app = Celery(
    "bharatboot",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    enable_utc=True,
    timezone="Asia/Kolkata",
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_retry_delay=30,
    task_default_max_retries=5,
    task_routes={
        "invoices.*": {"queue": "invoices"},
        "tenders.*": {"queue": "tenders"},
        "gstr.*": {"queue": "gstr"},
        "notify.*": {"queue": "notify"},
    },
    beat_schedule={
        "poll_cppp_rss_every_6h": {
            "task": "tenders.poll_rss",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        "poll_tender_inbox_every_30m": {
            "task": "tenders.poll_email",
            "schedule": crontab(minute="*/30"),
        },
        "cleanup_expired_idempotency_keys_hourly": {
            "task": "maint.cleanup_idempotency",
            "schedule": crontab(minute=15),
        },
    },
)

# Import task modules so Celery sees them
from app.worker import tasks  # noqa: E402,F401
