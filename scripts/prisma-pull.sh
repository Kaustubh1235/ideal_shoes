#!/usr/bin/env bash
# Mirror the Alembic-owned Postgres schema into Prisma so the Next.js side gets
# fresh TypeScript types after a migration.
#
# Usage:
#   1. Make schema changes in apps/api/app/db/models.py
#   2. cd apps/api && alembic revision --autogenerate -m "describe change"
#   3. alembic upgrade head
#   4. pnpm prisma:pull  (this script)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/db"

echo "→ Pulling DB schema into Prisma…"
pnpm exec prisma db pull

echo "→ Generating Prisma client…"
pnpm exec prisma generate

echo "✓ Schema synced."
