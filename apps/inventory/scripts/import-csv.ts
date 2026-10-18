/**
 * Import a CSV (Stock Book export or any brand,article,colour,size,cat,cost,mrp,qty,loc file)
 * straight into the database, without going through the web UI. Useful for the first bulk load.
 *
 *   bun scripts/import-csv.ts path/to/stock.csv            # uses DATA_DIR or ./data
 *   DATA_DIR=/data bun scripts/import-csv.ts stock.csv     # inside the container
 */
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { openDb } from "../src/db";
import { addStock, parseCsv } from "../src/stock";

const file = process.argv[2];
if (!file) {
  console.error("usage: bun scripts/import-csv.ts <file.csv>");
  process.exit(2);
}
const root = join(dirname(Bun.fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ?? join(root, "data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "stockroom.db");
const db = openDb(dbPath);
const rows = parseCsv(await Bun.file(file).text());
if (!rows.length) {
  console.error("no rows found; the CSV needs at least brand, article and qty columns");
  process.exit(1);
}
const results = addStock(db, rows, { userId: null, source: "import" });
const added = results.filter((r) => r.movement.type === "new").length;
console.log(`${rows.length} rows → ${added} new SKUs, ${results.length - added} topped up (${dbPath})`);
