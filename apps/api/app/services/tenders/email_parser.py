"""IMAP-based tender inbox ingestor.

Connects to TENDER_INBOX_USER on TENDER_INBOX_HOST, fetches UNSEEN mails, extracts
basic metadata (sender = buyer_org, subject = title, body = description, attachments
go to documentUrls after S3 upload).
"""
from __future__ import annotations

import email
import imaplib
import logging
import re
from datetime import datetime, timezone
from email.header import decode_header
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.enums import TenderSource
from app.db.session import SessionLocal
from app.services.storage.s3 import s3_client
from app.services.tenders.writer import upsert_tender

log = logging.getLogger(__name__)


def _decode(value: str | bytes | None) -> str:
    if not value:
        return ""
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="replace")
        except Exception:
            return value.decode("latin-1", errors="replace")
    parts = decode_header(value)
    out: list[str] = []
    for chunk, charset in parts:
        if isinstance(chunk, bytes):
            try:
                out.append(chunk.decode(charset or "utf-8", errors="replace"))
            except Exception:
                out.append(chunk.decode("latin-1", errors="replace"))
        else:
            out.append(chunk)
    return "".join(out)


def _extract_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in (part.get("Content-Disposition") or ""):
                return _decode(part.get_payload(decode=True))
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                html = _decode(part.get_payload(decode=True))
                return re.sub(r"<[^>]+>", " ", html)
    else:
        payload = msg.get_payload(decode=True)
        return _decode(payload)
    return ""


def poll_tender_inbox(session: Session | None = None) -> int:
    s = get_settings()
    if not (s.tender_inbox_host and s.tender_inbox_user and s.tender_inbox_pass):
        log.info("tender_inbox.not_configured")
        return 0

    ingested = 0
    cls = imaplib.IMAP4_SSL if s.tender_inbox_tls else imaplib.IMAP4
    with cls(s.tender_inbox_host, s.tender_inbox_port) as m:
        m.login(s.tender_inbox_user, s.tender_inbox_pass)
        m.select("INBOX")
        _, data = m.search(None, "UNSEEN")
        ids = (data[0] or b"").split()

        own_session = session is None
        db = session or SessionLocal()
        try:
            for mid in ids:
                _, msg_data = m.fetch(mid, "(RFC822)")
                raw_bytes = msg_data[0][1] if msg_data and isinstance(msg_data[0], tuple) else None
                if not raw_bytes:
                    continue
                msg = email.message_from_bytes(raw_bytes)
                subject = _decode(msg.get("Subject", "")).strip()
                sender = email.utils.parseaddr(msg.get("From", ""))[1] or "unknown"
                body = _extract_body(msg)
                doc_urls: list[str] = []

                # Stash attachments to S3
                for part in msg.walk():
                    fname = part.get_filename()
                    if fname:
                        data_b = part.get_payload(decode=True)
                        if data_b:
                            key = f"tender_email_attachments/{mid.decode()}_{fname}"
                            url = s3_client.upload_bytes(
                                key, data_b, part.get_content_type() or "application/octet-stream"
                            )
                            doc_urls.append(url)

                row: dict[str, Any] = {
                    "source": TenderSource.email,
                    "external_id": (msg.get("Message-ID") or f"{sender}-{mid.decode()}")[:128],
                    "title": subject[:500] or "(no subject)",
                    "buyer_org": sender[:300],
                    "description": body[:8000],
                    "published_at": datetime.now(timezone.utc),
                    "document_urls": doc_urls or None,
                    "raw_payload": {
                        "from": sender,
                        "subject": subject,
                        "message_id": msg.get("Message-ID"),
                    },
                }
                if upsert_tender(db, row):
                    ingested += 1

                m.store(mid, "+FLAGS", "\\Seen")
        finally:
            if own_session:
                db.close()

    log.info("tender_inbox.poll.done", extra={"ingested": ingested})
    return ingested
