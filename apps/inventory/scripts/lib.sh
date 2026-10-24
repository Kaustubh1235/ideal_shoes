# Shared helpers for the backup scripts. Sourced, not run. Expects to be in apps/inventory.

# Print "<SKUs> SKUs, <units> units" for a database inside a running container: counts CONTAINER DBPATH
counts() {
  docker exec -e DB="$2" "$1" bun -e '
    const d = new (require("bun:sqlite").Database)(process.env.DB, { readonly: true });
    const r = d.query("SELECT COUNT(*) AS skus, COALESCE(SUM(qty), 0) AS units FROM items").get();
    console.log(`${r.skus} SKUs, ${r.units} units`);'
}

# Name of the running app container, or nothing.
app_container() {
  docker compose ps -q app 2>/dev/null | head -n 1
}

# Take a consistent copy of the live database into ./backups and print its path there.
snapshot() {
  c=$(app_container)
  [ -n "$c" ] || { echo "The app is not running (docker compose up -d)." >&2; return 1; }
  name="stockroom-$(date -u +%Y-%m-%d-%H-%M-%S).db"
  docker exec -e OUT="/backups/$name" "$c" bun -e '
    new (require("bun:sqlite").Database)("/data/stockroom.db").run("VACUUM INTO ?", [process.env.OUT]);' >&2
  echo "backups/$name"
}
