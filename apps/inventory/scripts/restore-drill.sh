#!/bin/sh
# Prove a backup can be restored, without touching the live app:
# start a throwaway copy of the app on the backup, check it is healthy, compare item counts, remove it.
#   sh scripts/restore-drill.sh                       # takes a fresh backup and drills that
#   sh scripts/restore-drill.sh backups/<file>.db     # drills a specific backup
set -eu
cd "$(dirname "$0")/.."
. scripts/lib.sh
live=$(app_container)
if [ $# -gt 0 ]; then file=$1; else file=$(snapshot); fi
case "$file" in backups/*.db) ;; *) echo "Give a file inside ./backups, e.g. backups/stockroom-2026-01-31-02-00-00.db" >&2; exit 1 ;; esac
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

drill=stockroom-restore-drill
docker rm -f "$drill" >/dev/null 2>&1 || true
trap 'docker rm -f "$drill" >/dev/null 2>&1 || true' EXIT
# Its own data folder and secret, backups off, no ports: it cannot affect the live app.
docker compose run -d --no-deps --name "$drill" -e DATA_DIR=/tmp/drill -e BACKUPS=off \
  -e APP_SECRET="drill-$(date +%s)-not-a-real-secret-0000000000" \
  --entrypoint sh app -c "mkdir -p /tmp/drill && cp '/$file' /tmp/drill/stockroom.db && exec bun src/server.ts" >/dev/null

i=0
until health=$(docker exec "$drill" bun -e "fetch('http://127.0.0.1:8787/healthz').then(r=>r.text()).then(t=>{console.log(t);process.exit(JSON.parse(t).ok?0:1)}).catch(()=>process.exit(1))" 2>/dev/null); do
  i=$((i + 1)); [ $i -lt 30 ] || { echo "FAILED: the restored copy did not become healthy"; docker logs "$drill" | tail -20; exit 1; }
  sleep 1
done
restored=$(counts "$drill" /tmp/drill/stockroom.db)
echo "backup:   $file"
echo "health:   $health"
echo "restored: $restored"
if [ -n "$live" ]; then
  now=$(counts "$live" /data/stockroom.db)
  echo "live:     $now"
  if [ "$restored" = "$now" ]; then echo "OK: restore works and the counts match."
  else echo "Restore works. Counts differ from live, which is expected if stock moved after this backup was taken."; fi
else
  echo "OK: restore works (live app not running, nothing to compare)."
fi
