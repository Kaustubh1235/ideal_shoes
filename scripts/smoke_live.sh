#!/bin/sh
# Read-only checks of the live site from the outside, as an attacker would start: what answers, what must
# not, and that money cannot be faked. Changes nothing. Run after every deploy and nightly by GitHub
# (.github/workflows/deploy.yml, live-check.yml), or by hand:
#
#   sh scripts/smoke_live.sh idealx.store [server IP]
#
# Exits non-zero on the first thing that is wrong, and says what.
set -u
SITE="${1:?usage: smoke_live.sh <site domain> [server ip]}"
IP="${2:-}"
STOCK="stock.$SITE"
fails=0
ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }

echo "Live checks for $SITE"

# ---- up and healthy ----
for u in "https://$SITE/" "https://$SITE/api/v1/healthz" "https://$SITE/api/healthz" "https://$STOCK/healthz"; do
  [ "$(code --retry 3 --retry-delay 5 "$u")" = 200 ] && ok "$u answers" || bad "$u does not answer 200"
done

# ---- HTTPS only, with the security headers ----
[ "$(code "http://$SITE/")" = 308 ] && ok "plain http goes to https" || bad "http://$SITE/ is not redirected to https"
h=$(curl -sI -m 20 "https://$SITE/")
for want in "strict-transport-security: max-age=31536000" "x-content-type-options: nosniff" "content-security-policy:" "x-frame-options:"; do
  printf '%s' "$h" | grep -qi "$want" && ok "header $want" || bad "header missing: $want"
done
printf '%s' "$h" | grep -qi '^server:' && bad "the Server header gives away the software" || ok "no Server header"

# ---- money: an order turns paid only when Razorpay signs the message ----
[ "$(code -X POST -H 'content-type: application/json' -H 'x-razorpay-signature: 00' -d '{"event":"payment.captured","payload":{"payment":{"entity":{"order_id":"order_x","amount":1}}}}' "https://$SITE/api/v1/payments/razorpay/webhook")" = 400 ] \
  && ok "an unsigned 'payment captured' is refused" || bad "the payment webhook accepted an unsigned message"
[ "$(code -X POST -H 'content-type: application/json' -d '{}' "https://$SITE/api/v1/payments/razorpay/webhook")" = 400 ] \
  && ok "a webhook without any signature is refused" || bad "the payment webhook accepted a message with no signature"

# ---- data: the internal API, docs and admin stay closed ----
for p in /api/v1/docs /api/v1/openapi.json /api/v1/orders /api/v1/admin /api/v1/payments/razorpay/order; do
  [ "$(code "https://$SITE$p")" = 404 ] && ok "$p is not public" || bad "$p is reachable from outside"
done
[ "$(code "https://$SITE/admin")" = 307 ] && ok "/admin asks for a login" || bad "/admin does not send strangers to the login"
for p in /api/v1/bootstrap /api/v1/items /api/v1/bills /api/v1/admin/backup /api/v1/admin/users /api/v1/export/items.csv /api/v1/public/stock /api/v1/public/listings; do
  [ "$(code "https://$STOCK$p")" = 401 ] && ok "Stock Room $p needs a login or key" || bad "Stock Room $p answers without a login"
done
[ "$(code "https://$STOCK/metrics")" = 404 ] && ok "Stock Room numbers page is hidden" || bad "Stock Room /metrics is public"
[ "$(code -X POST -H 'content-type: application/json' -d '{}' "https://$STOCK/api/v1/items")" = 401 ] \
  && ok "Stock Room refuses changes without a login" || bad "Stock Room accepted a change without a login"

# ---- only the website and the key-only login are open on the server ----
if [ -n "$IP" ] && command -v nc >/dev/null 2>&1; then
  # A dropped connection must time out quickly: the Mac's nc needs -G for that, Linux's uses -w.
  if nc -h 2>&1 | grep -q -- '-G conntimo'; then wait_flag="-G 3"; else wait_flag="-w 3"; fi
  for port in 3000 5432 6379 8000 8333 8787 9000 9333; do
    # shellcheck disable=SC2086
    nc -z $wait_flag "$IP" "$port" 2>/dev/null && bad "port $port is open to the internet" || ok "port $port closed"
  done
fi

echo
if [ "$fails" -gt 0 ]; then echo "$fails check(s) failed."; exit 1; fi
echo "All live checks passed."
