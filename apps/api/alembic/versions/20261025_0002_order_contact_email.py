"""Keep the email given at checkout on the order, so guests get their confirmation mail.

Revision ID: 20261025_0002
Revises: 20260101_0001
Create Date: 2026-10-25 00:00:00
"""
from __future__ import annotations

from alembic import op

revision = "20261025_0002"
down_revision = "20260101_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: the baseline migration runs create_all, so a fresh database already has it.
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_email VARCHAR(254)")


def downgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS contact_email")
