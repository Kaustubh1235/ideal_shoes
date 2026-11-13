# Shared helpers for the backup scripts. Sourced, not run. Expects to be in apps/inventory.

# Which stack runs Stock Room: its own docker-compose.yml here (service "app"), or the combined
# IDEALX stack at the repo root (service "inventory"), chosen when the root .env has STOCK_DOMAIN.
if [ -z "${DC:-}" ]; then
  if [ -f ../../infra/docker/compose.prod.yml ] && [ -f ../../.env ] && grep -q '^STOCK_DOMAIN=.' ../../.env; then
    DC="docker compose --env-file ../../.env -f ../../infra/docker/compose.prod.yml"
    SVC=inventory
  else
    DC="docker compose"
    SVC=app
  fi
fi
SVC=${SVC:-app}

# Print "<SKUs> SKUs, <units> units" for a database inside a running container: counts CONTAINER DBPATH
counts() {
  docker exec -e DB="$2" "$1" bun -e '
    const d = new (require("bun:sqlite").Database)(process.env.DB, { readonly: true });
    const r = d.query("SELECT COUNT(*) AS skus, COALESCE(SUM(qty), 0) AS units FROM items").get();
    console.log(`${r.skus} SKUs, ${r.units} units`);'
}

# Name of the running app container, or nothing.
app_container() {
  $DC ps -q "$SVC" 2>/dev/null | head -n 1
}

# Take a consistent copy of the live database into ./backups and print its path there.
snapshot() {
  c=$(app_container)
  [ -n "$c" ] || { echo "The app is not running ($DC up -d)." >&2; return 1; }
  name="stockroom-$(date -u +%Y-%m-%d-%H-%M-%S).db"
  docker exec -e OUT="/backups/$name" "$c" bun -e '
    new (require("bun:sqlite").Database)("/data/stockroom.db").run("VACUUM INTO ?", [process.env.OUT]);' >&2
  echo "backups/$name"
}
