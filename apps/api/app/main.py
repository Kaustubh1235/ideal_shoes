"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import (
    auth,
    gstr,
    health,
    invoices,
    orders_internal,
    payments,
    tenders,
    uploads,
)

settings = get_settings()

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer() if settings.is_production else structlog.dev.ConsoleRenderer(),
    ],
)
logging.basicConfig(level=settings.log_level.upper())
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("api.startup", env=settings.environment)
    yield
    log.info("api.shutdown")


app = FastAPI(
    title="BharatBoot API",
    version="0.1.0",
    description="GST invoicing, payments, integrations, jobs for BharatBoot",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if not settings.is_production else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(payments.router, prefix="/payments", tags=["payments"])
app.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
app.include_router(orders_internal.router, prefix="/orders", tags=["orders"])
app.include_router(tenders.router, prefix="/tenders", tags=["tenders"])
app.include_router(gstr.router, prefix="/gstr", tags=["gstr"])
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])


@app.exception_handler(Exception)
async def _global_error_handler(_request, exc: Exception):
    log.exception("api.unhandled", error=str(exc))
    return JSONResponse(status_code=500, content={"error": "internal_error"})
