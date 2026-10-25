#!/bin/sh
# Run the IDEALX production stack (shop + Stock Room) from the repo root.
#
#   sh scripts/prod.sh init            create .env with fresh random secrets (once)
#   sh scripts/prod.sh up -d --build   start or update everything
#   sh scripts/prod.sh ps | logs -f web | down | exec api ...   any docker compose command
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "init" ]; then
  [ ! -f .env ] || { echo ".env already exists; not overwriting it." >&2; exit 1; }
  rand() { openssl rand -hex "$1"; }
  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rand 24)|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(rand 24)|" \
    -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$(rand 32)|" \
    -e "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=idealx$(rand 6)|" \
    -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=$(rand 24)|" \
    -e "s|^STOCK_APP_SECRET=.*|STOCK_APP_SECRET=$(rand 32)|" \
    .env.production.example > .env
  chmod 600 .env
  echo "Created .env with new secrets. Now set SITE_DOMAIN and STOCK_DOMAIN in it (nano .env)."
  echo "Keep a copy of .env somewhere safe: without it the backups cannot be read back in full."
  exit 0
fi

[ -f .env ] || { echo "No .env yet. Run: sh scripts/prod.sh init" >&2; exit 1; }
# Shown in Stock Room's header so the owner can tell which build a phone is running.
APP_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' apps/inventory/package.json | head -n 1)+$(git rev-parse --short HEAD 2>/dev/null || echo local)"
export APP_VERSION
exec docker compose --env-file .env -f infra/docker/compose.prod.yml "$@"
