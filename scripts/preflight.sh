#!/bin/sh
# Checks a server is ready to run IDEALX before anything starts. Run from the repo root:
#
#   sh scripts/preflight.sh
#
# `sh scripts/prod.sh up ...` runs it first by itself (SKIP_PREFLIGHT=1 to skip, e.g. on a test box).
# FAIL stops the start; WARN is worth reading but does not stop it.
set -u
cd "$(dirname "$0")/.."

fails=0
warns=0
ok() { printf '  ok    %s\n' "$1"; }
warn() { printf '  WARN  %s\n' "$1"; warns=$((warns + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }
env_get() { sed -n "s/^$1=//p" .env | tail -n 1; }

echo "IDEALX pre-flight"

# ---- settings -----------------------------------------------------------------
if [ ! -f .env ]; then
  fail ".env is missing: run sh scripts/prod.sh init"
  echo "$fails problem(s)."
  exit 1
fi
perm=$(stat -c %a .env 2>/dev/null || stat -f %Lp .env)
[ "$perm" = "600" ] && ok ".env readable by its owner only" || fail ".env is mode $perm; run: chmod 600 .env"

for k in POSTGRES_PASSWORD REDIS_PASSWORD AUTH_SECRET S3_ACCESS_KEY S3_SECRET_KEY STOCK_APP_SECRET STOCK_SETUP_TOKEN STOCK_METRICS_TOKEN SITE_DOMAIN STOCK_DOMAIN; do
  [ -n "$(env_get $k)" ] || fail "$k is empty in .env (sh scripts/prod.sh init fills the secrets)"
done
for k in AUTH_SECRET STOCK_APP_SECRET; do
  v=$(env_get $k)
  [ -z "$v" ] || [ ${#v} -ge 32 ] || fail "$k is shorter than 32 characters"
done
site=$(env_get SITE_DOMAIN)
stock=$(env_get STOCK_DOMAIN)
case "$site$stock" in
  *localhost*|*example*) fail "SITE_DOMAIN/STOCK_DOMAIN still point at a test name ($site, $stock)" ;;
  *) ok "domains: $site, www.$site, $stock" ;;
esac
[ "$(env_get OTP_DEV_MODE)" = "true" ] && fail "OTP_DEV_MODE=true would show login codes on screen; remove it"
[ "$(env_get LOCAL_MOCKS)" = "true" ] && fail "LOCAL_MOCKS=true is for a laptop test only (fake Pay button, admin codes on screen); remove it"
[ -n "$(env_get SELLER_GSTIN)" ] || warn "SELLER_GSTIN is empty: invoices need the shop's GST identity (docs/DEPLOY.md step 4)"
case "$(env_get RAZORPAY_KEY_ID)" in
  "") warn "Razorpay not set: online payment is off until you add keys (docs/GO-LIVE.md)" ;;
  rzp_test_*) warn "Razorpay is in TEST mode: switch to live keys after KYC before taking real orders" ;;
  *) [ -n "$(env_get RAZORPAY_WEBHOOK_SECRET)" ] && ok "Razorpay live keys and webhook secret" || fail "RAZORPAY_WEBHOOK_SECRET is empty: paid orders would never be marked paid" ;;
esac
[ -n "$(env_get RCLONE_REMOTE)" ] || warn "RCLONE_REMOTE is empty: backups stay on this server only (docs/DEPLOY.md step 11)"

# ---- machine ------------------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then ok "docker and compose"; else fail "docker with the compose plugin is not installed"; fi
free_gb=$(df -Pk . | awk 'NR==2 {print int($4 / 1048576)}')
[ "$free_gb" -ge 10 ] && ok "disk: ${free_gb} GB free" || warn "disk: only ${free_gb} GB free (builds and backups want 10+)"
if [ -r /proc/meminfo ]; then
  mem_mb=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
  swap_mb=$(awk '/SwapTotal/ {print int($2 / 1024)}' /proc/meminfo)
  if [ "$mem_mb" -lt 3500 ] && [ "$swap_mb" -lt 2000 ]; then warn "memory ${mem_mb} MB and swap ${swap_mb} MB: building the site needs about 4 GB; add swap"; else ok "memory ${mem_mb} MB, swap ${swap_mb} MB"; fi
fi
for port in 80 443; do
  if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
    docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -q "caddy.*:$port->" && ok "port $port: our Caddy" || fail "port $port is taken by another program (stop it: sudo ss -ltnp 'sport = :$port')"
  fi
done

# ---- DNS: every name must point at this server, or Let's Encrypt cannot issue certificates ----
me=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
if [ -z "$me" ]; then
  warn "could not find this server's public IP (no internet?); DNS not checked"
else
  for name in "$site" "www.$site" "$stock"; do
    ips=$(getent ahostsv4 "$name" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')
    case " $ips " in
      *" $me "*) ok "DNS $name → $me" ;;
      "  ") fail "DNS $name does not resolve yet (A record → $me)" ;;
      *) fail "DNS $name → $ips, but this server is $me" ;;
    esac
  done
fi

echo
if [ "$fails" -gt 0 ]; then
  echo "$fails problem(s) to fix first, $warns warning(s)."
  exit 1
fi
echo "Ready. $warns warning(s)."
