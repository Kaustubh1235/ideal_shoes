#!/bin/sh
# Bring the running site up to the newest commit of main, and roll back if it does not come up.
#
#   sudo sh scripts/deploy.sh          by hand on the server
#
# GitHub Actions runs it after CI passes on main (.github/workflows/deploy.yml). Its SSH key is
# pinned to this one command in authorized_keys, so the key cannot open a shell or run anything
# else (docs/DEPLOY.md, "Automatic deploys").
set -eu
cd "$(dirname "$0")/.."

# One deploy at a time: a second push waits for the first to finish instead of racing it.
exec 9>/var/lock/idealx-deploy.lock
flock -w 1800 9 || { echo "deploy: another deploy is still running" >&2; exit 1; }

BRANCH="${DEPLOY_BRANCH:-main}"
env_get() { sed -n "s/^$1=//p" .env | tail -n 1; }
site=$(env_get SITE_DOMAIN)
stock=$(env_get STOCK_DOMAIN)

healthy() {
  # Through Caddy on this machine, as a visitor would reach it (certificates included).
  curl -fsS --max-time 5 --resolve "$site:443:127.0.0.1" "https://$site/api/v1/healthz" >/dev/null 2>&1 &&
    curl -fsS --max-time 5 --resolve "$site:443:127.0.0.1" "https://$site/api/healthz" >/dev/null 2>&1 &&
    curl -fsS --max-time 5 --resolve "$stock:443:127.0.0.1" "https://$stock/healthz" >/dev/null 2>&1
}
wait_healthy() {
  i=0
  while [ "$i" -lt 30 ]; do
    healthy && return 0
    i=$((i + 1))
    sleep 10
  done
  return 1
}

before=$(git rev-parse HEAD)
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git merge --ff-only --quiet "origin/$BRANCH"
after=$(git rev-parse HEAD)
echo "deploy: $(git rev-parse --short "$before") -> $(git rev-parse --short "$after")"

if sh scripts/prod.sh up -d --build --remove-orphans && wait_healthy; then
  docker image prune -f >/dev/null 2>&1 || true
  echo "deploy: healthy at $(git rev-parse --short HEAD)"
  exit 0
fi

echo "deploy: the new version did not come up; going back to $(git rev-parse --short "$before")" >&2
sh scripts/prod.sh ps >&2 || true
git checkout --quiet "$before"
SKIP_PREFLIGHT=1 sh scripts/prod.sh up -d --build --remove-orphans
if wait_healthy; then echo "deploy: rolled back, site is up on the old version" >&2; else echo "deploy: rollback did not come up either; look at: sh scripts/prod.sh logs --tail 100" >&2; fi
# The database migrations of the failed version stay applied; they are additive, so the old code keeps working.
exit 1
