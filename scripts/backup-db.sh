#!/usr/bin/env bash
# Dump Postgres to backups/ with timestamp.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/backups"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$ROOT/backups/bharatboot_${STAMP}.sql.gz"

echo "→ Dumping DB to $OUT"
docker compose -f "$ROOT/infra/docker/compose.yml" exec -T postgres \
  pg_dump -U bharatboot -d bharatboot | gzip > "$OUT"

echo "✓ Backup complete."
ls -lh "$OUT"
