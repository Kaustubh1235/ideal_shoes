#!/bin/sh
# Update Stock Room to the latest code and restart it. Run from apps/inventory on the server:
#   sh scripts/update.sh
# Stock, staff and backups are kept (they live in the data volume and ./backups).
set -eu
cd "$(dirname "$0")/.."
. scripts/lib.sh
git pull --ff-only
# Shown at the top of the app, so the owner can tell which build a phone is running.
APP_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -n 1)+$(git rev-parse --short HEAD)"
export APP_VERSION
# In the combined IDEALX stack this rebuilds the whole stack (shop included) from the same pull.
$DC up -d --build
echo "Stock Room $APP_VERSION is starting. Check: $DC ps"
