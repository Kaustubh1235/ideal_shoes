#!/bin/sh
# Take a fresh backup and copy it off this machine with rclone (Google Drive by default).
# Run from anywhere on the server:
#   sh scripts/backup-offsite.sh
# Settings (optional): RCLONE_REMOTE=gdrive:StockRoom   KEEP_DAYS=90
# Setting up the "gdrive" remote once is described in DEPLOY.md ("Backups off the machine").
set -eu
cd "$(dirname "$0")/.."
. scripts/lib.sh
REMOTE="${RCLONE_REMOTE:-gdrive:StockRoom}"
KEEP_DAYS="${KEEP_DAYS:-90}"

command -v rclone >/dev/null || { echo "rclone is not installed. Install it: curl https://rclone.org/install.sh | sudo bash" >&2; exit 1; }

# A fresh snapshot rather than the newest nightly file: the nightly one is written at a time that
# depends on when the app last started, and could still be half-written when this runs.
file=$(snapshot)
rclone copy "$file" "$REMOTE"
# Keep the remote from growing forever.
rclone delete "$REMOTE" --include "stockroom-*.db" --min-age "${KEEP_DAYS}d"
echo "$(date -u +%FT%TZ) copied $(basename "$file") to $REMOTE ($(counts "$(app_container)" /data/stockroom.db))"
