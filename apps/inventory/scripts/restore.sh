#!/bin/sh
# Replace the live database with a backup. The app is stopped for a few seconds.
# The current database is backed up first, so a wrong restore can itself be undone.
#   sh scripts/restore.sh backups/stockroom-2026-01-31-02-00-00.db
# Run scripts/restore-drill.sh on the same file first if you are unsure about it.
set -eu
cd "$(dirname "$0")/.."
. scripts/lib.sh
file="${1:-}"
case "$file" in backups/*.db) ;; *) echo "Usage: sh scripts/restore.sh backups/<file>.db  (copy a downloaded backup into ./backups first)" >&2; exit 1 ;; esac
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

# Keep the current database: a clean single-file snapshot while the app runs; if the app is down,
# the raw files (restore those by hand: all three belong together).
if [ -n "$(app_container)" ]; then keep=$(snapshot); raw=""; else keep="backups/before-restore-$(date -u +%Y-%m-%d-%H-%M-%S).db"; raw=1; fi
$DC stop "$SVC"
$DC run --rm --no-deps --entrypoint sh "$SVC" -c "
  set -e
  if [ -n '$raw' ]; then for s in '' -wal -shm; do [ ! -f /data/stockroom.db\$s ] || cp /data/stockroom.db\$s '/$keep'\$s; done; fi
  cp '/$file' /data/stockroom.db.new
  rm -f /data/stockroom.db-wal /data/stockroom.db-shm
  mv /data/stockroom.db.new /data/stockroom.db"
$DC up -d "$SVC"
i=0
until c=$(app_container) && [ -n "$c" ] && docker exec "$c" bun -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1)); [ $i -lt 30 ] || { echo "The app did not come back healthy. Logs: $DC logs $SVC"; exit 1; }
  sleep 1
done
echo "Restored $file ($(counts "$c" /data/stockroom.db)). The previous database is in $keep"
