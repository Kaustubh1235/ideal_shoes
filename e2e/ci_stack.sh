#!/bin/sh
# The whole production stack on one machine, used like a customer, the owner and a dealer would
# (e2e/stack_e2e.py), with test-only settings: *.localhost names, Caddy's own certificates, a mail
# catcher and a fake AI. Run by CI on every push and pull request; also works on a laptop:
#
#   sh e2e/ci_stack.sh          from the repo root; needs Docker, pnpm (installed) and Python with Playwright
#                               (PYTHON=/path/to/python picks the Python that has it)
#
# Leaves the stack running when it fails, so `docker compose ... logs` can show why; `sh e2e/ci_stack.sh down` stops it.
set -eu
cd "$(dirname "$0")/.."
# The repo path as Docker sees it: on a Mac /tmp is really /private/tmp, which the Docker VM does not know.
export STACK_ROOT="${STACK_ROOT:-$(pwd)}"
DC="docker compose --env-file .env -f infra/docker/compose.prod.yml -f e2e/compose.e2e.yml"

if [ "${1:-}" = "down" ]; then
  $DC down -v --remove-orphans
  exit 0
fi

[ ! -f .env ] || { echo "ci_stack: .env exists here; refusing to overwrite it (this is not a server, is it?)" >&2; exit 1; }
sh scripts/prod.sh init >/dev/null
set_env() { sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; grep -q "^$1=" .env || echo "$1=$2" >> .env; }
set_env SITE_DOMAIN idealx.localhost
set_env STOCK_DOMAIN stock.idealx.localhost
set_env RAZORPAY_WEBHOOK_SECRET whsec_e2e_local_only
set_env SMTP_HOST mailpit
set_env SMTP_PORT 1025
set_env SMTP_TLS false
set_env SELLER_GSTIN 09AAACI1234F1Z5
set_env SELLER_EMAIL care@idealx.localhost
set_env SELLER_PHONE +919999999999
set_env GRIEVANCE_OFFICER "Test Officer, care@idealx.localhost"

echo "ci_stack: building and starting the stack"
$DC up -d --build
# Up when the shop, its API and Stock Room answer through Caddy (with Caddy's own test certificates).
i=0
until curl -fsk -o /dev/null --resolve idealx.localhost:443:127.0.0.1 https://idealx.localhost/api/v1/healthz &&
  curl -fsk -o /dev/null --resolve idealx.localhost:443:127.0.0.1 https://idealx.localhost/api/healthz &&
  curl -fsk -o /dev/null --resolve stock.idealx.localhost:443:127.0.0.1 https://stock.idealx.localhost/healthz; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || { echo "ci_stack: the stack did not come up in 10 minutes" >&2; $DC ps >&2; $DC logs --tail 40 >&2; exit 1; }
  sleep 10
done

PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
echo "ci_stack: demo data"
DATABASE_URL="postgresql://idealx:$PW@127.0.0.1:55433/idealx" pnpm db:seed > e2e/seed.log

echo "ci_stack: acceptance test"
"${PYTHON:-python3}" e2e/stack_e2e.py e2e/seed.log
