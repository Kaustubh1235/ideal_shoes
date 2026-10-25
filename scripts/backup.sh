#!/bin/sh
# Back up everything the IDEALX stack holds, into ./backups on this server, and off the machine
# when rclone is set up (see docs/DEPLOY.md, "Backups").
#
#   sh scripts/backup.sh
#
# Writes:
#   backups/site/postgres-<UTC time>.dump    orders, customers, products, invoices (pg_dump custom format)
#   backups/site/storage/<bucket>/...        product photos and invoice PDFs (mirrored, so later runs are quick)
#   apps/inventory/backups/stockroom-*.db    Stock Room (its own nightly backups also land here)
# Then, if RCLONE_REMOTE is set (e.g. gdrive:IDEALX) and rclone is installed, copies them there.
# Keeps the newest KEEP_DUMPS database dumps locally (default 14).
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "No .env here; run from the repo root of a configured server." >&2; exit 1; }

dc() { docker compose --env-file .env -f infra/docker/compose.prod.yml "$@"; }
env_get() { sed -n "s/^$1=//p" .env | tail -n 1; }

stamp=$(date -u +%Y-%m-%d-%H-%M-%S)
mkdir -p backups/site/storage

# 1. Postgres: a consistent dump while the site keeps running.
dc exec -T postgres pg_dump -U idealx -d idealx -Fc > "backups/site/postgres-$stamp.dump.part"
mv "backups/site/postgres-$stamp.dump.part" "backups/site/postgres-$stamp.dump"
echo "database: backups/site/postgres-$stamp.dump ($(du -h "backups/site/postgres-$stamp.dump" | cut -f1))"

# 2. Object storage, through its S3 API from inside the stack's network (it is not exposed).
net="$(dc ps -q storage | xargs docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | cut -d' ' -f1)"
for bucket in "$(env_get S3_BUCKET)" "$(env_get S3_PRIVATE_BUCKET)"; do
  [ -n "$bucket" ] || continue
  mkdir -p "backups/site/storage/$bucket"
  docker run --rm --network "$net" -v "$PWD/backups/site/storage:/out" \
    -e RCLONE_CONFIG_S_TYPE=s3 -e RCLONE_CONFIG_S_PROVIDER=Other \
    -e RCLONE_CONFIG_S_ENDPOINT=http://storage:8333 \
    -e RCLONE_CONFIG_S_ACCESS_KEY_ID="$(env_get S3_ACCESS_KEY)" \
    -e RCLONE_CONFIG_S_SECRET_ACCESS_KEY="$(env_get S3_SECRET_KEY)" \
    rclone/rclone:1.75.2 sync "s:$bucket" "/out/$bucket" --quiet
  echo "storage:  backups/site/storage/$bucket ($(find "backups/site/storage/$bucket" -type f | wc -l | tr -d ' ') files)"
done

# 3. Stock Room: a fresh snapshot next to its nightly ones.
(cd apps/inventory && . scripts/lib.sh && echo "stock:    apps/inventory/$(snapshot)")

# 4. Keep the newest database dumps.
ls -1t backups/site/postgres-*.dump 2>/dev/null | tail -n +"$((${KEEP_DUMPS:-14} + 1))" | xargs rm -f --

# 5. Off the machine.
remote="${RCLONE_REMOTE:-$(env_get RCLONE_REMOTE)}"
if [ -n "$remote" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy backups/site "$remote/site" --exclude "*.part"
  rclone copy apps/inventory/backups "$remote/stockroom" --include "stockroom-*.db"
  # Off-site copies of dumps older than 90 days are pruned; photos and invoices are kept.
  rclone delete "$remote/site" --include "postgres-*.dump" --min-age "${KEEP_DAYS:-90}d"
  echo "off-site: copied to $remote"
else
  echo "off-site: skipped (set RCLONE_REMOTE in .env and install rclone; see docs/DEPLOY.md)"
fi
