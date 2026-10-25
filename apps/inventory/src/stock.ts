import type { Database } from "bun:sqlite";
import { getItem, now, type ItemRow, type MovementRow } from "./db";

export const CATEGORIES = ["boot", "shoe", "jacket", "bag", "belt", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const SIZED_CATEGORIES: Category[] = ["boot", "shoe", "jacket", "belt"];

export class StockError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const code = (s: unknown, n: number) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, n);

export function skuFor(brand: string, article: string, colour: string, size: string): string {
  const prefix = [code(brand, 4), code(article, 8), code(colour, 3)].filter(Boolean).join("-");
  return size && size !== "-" ? `${prefix}-${code(size, 4)}` : prefix;
}

export function normalizeSku(raw: string): string {
  let t = String(raw ?? "").trim();
  const i = t.lastIndexOf("#");
  if (i >= 0) t = t.slice(i + 1);
  return t.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export interface NewItemInput {
  brand: string;
  article: string;
  colour: string;
  size?: string;
  cat?: string;
  cost?: number;
  mrp?: number;
  loc?: string;
  qty: number;
}

function clean(s: unknown, max = 60): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function int(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export interface Actor {
  userId?: string | null;
  source: "app" | "api" | "import";
}

export interface ApplyResult {
  item: ItemRow;
  movement: MovementRow;
  idempotent?: boolean;
}

function insertMovement(db: Database, m: MovementRow) {
  db.query(
    "INSERT INTO movements (id, sku, type, delta, before_qty, after_qty, note, by_user, source, ref, at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(m.id, m.sku, m.type, m.delta, m.before_qty, m.after_qty, m.note, m.by_user, m.source, m.ref, m.at);
}

/** Create a SKU or top it up. Returns one result per input row. */
export function addStock(db: Database, rows: NewItemInput[], actor: Actor): ApplyResult[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new StockError(400, "No rows");
  if (rows.length > 500) throw new StockError(400, "Too many rows at once (max 500)");
  const results: ApplyResult[] = [];
  const tx = db.transaction(() => {
    for (const r of rows) {
      const brand = clean(r.brand),
        article = clean(r.article),
        colour = clean(r.colour, 30);
      const size = clean(r.size || "-", 8) || "-";
      const cat = (CATEGORIES as readonly string[]).includes(String(r.cat)) ? String(r.cat) : "shoe";
      const qty = int(r.qty);
      if (!brand || !article || !colour) throw new StockError(400, "Brand, article and colour are required");
      if (qty < 0) throw new StockError(400, "Quantity cannot be negative");
      const sku = skuFor(brand, article, colour, size);
      const t = now();
      const existing = getItem(db, sku);
      if (existing) {
        const after = existing.qty + qty;
        db.query(
          "UPDATE items SET qty = ?, last_in = CASE WHEN ? > 0 THEN ? ELSE last_in END, cost = CASE WHEN ? > 0 THEN ? ELSE cost END, mrp = CASE WHEN ? > 0 THEN ? ELSE mrp END, loc = CASE WHEN ? != '' THEN ? ELSE loc END, updated_at = ? WHERE sku = ?",
        ).run(after, qty, t, int(r.cost), int(r.cost), int(r.mrp), int(r.mrp), clean(r.loc), clean(r.loc), t, sku);
        const m: MovementRow = { id: crypto.randomUUID(), sku, type: "in", delta: qty, before_qty: existing.qty, after_qty: after, note: "Added from register", by_user: actor.userId ?? null, source: actor.source, ref: null, at: t };
        if (qty > 0) insertMovement(db, m);
        results.push({ item: getItem(db, sku)!, movement: m });
      } else {
        db.query(
          "INSERT INTO items (sku, brand, article, colour, size, cat, cost, mrp, qty, loc, created_at, last_in, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(sku, brand, article, colour, size, cat, int(r.cost), int(r.mrp), qty, clean(r.loc), t, t, t);
        const m: MovementRow = { id: crypto.randomUUID(), sku, type: "new", delta: qty, before_qty: 0, after_qty: qty, note: "New SKU", by_user: actor.userId ?? null, source: actor.source, ref: null, at: t };
        insertMovement(db, m);
        results.push({ item: getItem(db, sku)!, movement: m });
      }
    }
  });
  tx();
  return results;
}

export interface MovementInput {
  id?: string;
  sku: string;
  type: "in" | "out" | "count" | "adj";
  delta?: number;
  counted?: number;
  note?: string;
  ref?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apply one stock movement. Idempotent on `id`: a repeat returns the stored result. */
export function applyMovement(db: Database, input: MovementInput, actor: Actor): ApplyResult {
  const id = input.id && UUID_RE.test(input.id) ? input.id.toLowerCase() : crypto.randomUUID();
  const existing = db.query<MovementRow, [string]>("SELECT * FROM movements WHERE id = ?").get(id);
  if (existing) {
    const item = getItem(db, existing.sku);
    if (!item) throw new StockError(404, "Item no longer exists");
    return { item, movement: existing, idempotent: true };
  }
  const sku = normalizeSku(input.sku);
  const item = getItem(db, sku);
  if (!item) throw new StockError(404, `No item with code ${sku}`);
  const note = clean(input.note, 200);
  const t = now();
  let delta: number;
  let after: number;
  let type = input.type;
  if (type === "count") {
    const counted = int(input.counted, NaN);
    if (!Number.isFinite(counted) || counted < 0) throw new StockError(400, "counted must be a whole number ≥ 0");
    after = counted;
    delta = after - item.qty;
  } else if (type === "in" || type === "out" || type === "adj") {
    delta = int(input.delta, 0);
    if (delta === 0) throw new StockError(400, "delta must be non-zero");
    if (type === "out" && delta > 0) delta = -delta;
    if (type === "in" && delta < 0) delta = -delta;
    after = item.qty + delta;
    if (after < 0) {
      // Selling more than the book says: clamp, and record what really happened in the note.
      after = 0;
      delta = -item.qty;
    }
  } else {
    throw new StockError(400, "Unknown movement type");
  }
  const m: MovementRow = {
    id,
    sku,
    type,
    delta,
    before_qty: item.qty,
    after_qty: after,
    note: note || (type === "count" ? (delta === 0 ? "Count matched" : "Count corrected") : type === "out" ? "Sold" : type === "in" ? "Stock in" : "Adjustment"),
    by_user: actor.userId ?? null,
    source: actor.source,
    ref: input.ref ? clean(input.ref, 80) : null,
    at: t,
  };
  const tx = db.transaction(() => {
    insertMovement(db, m);
    db.query(
      "UPDATE items SET qty = ?, last_in = CASE WHEN ? > 0 AND ? != 'count' THEN ? ELSE last_in END, last_out = CASE WHEN ? < 0 AND ? != 'count' THEN ? ELSE last_out END, last_count = CASE WHEN ? = 'count' THEN ? ELSE last_count END, updated_at = ? WHERE sku = ?",
    ).run(after, delta, type, t, delta, type, t, type, t, t, sku);
  });
  tx();
  return { item: getItem(db, sku)!, movement: m };
}

export function updateItemDetails(db: Database, sku: string, patch: { cost?: number; mrp?: number; loc?: string; cat?: string }): ItemRow {
  const item = getItem(db, sku);
  if (!item) throw new StockError(404, "Item not found");
  const cost = patch.cost === undefined ? item.cost : Math.max(0, int(patch.cost));
  const mrp = patch.mrp === undefined ? item.mrp : Math.max(0, int(patch.mrp));
  const loc = patch.loc === undefined ? item.loc : clean(patch.loc);
  const cat = patch.cat && (CATEGORIES as readonly string[]).includes(patch.cat) ? patch.cat : item.cat;
  db.query("UPDATE items SET cost = ?, mrp = ?, loc = ?, cat = ?, updated_at = ? WHERE sku = ?").run(cost, mrp, loc, cat, now(), sku);
  return getItem(db, sku)!;
}

export function deleteItem(db: Database, sku: string, actor: Actor): void {
  const item = getItem(db, sku);
  if (!item) throw new StockError(404, "Item not found");
  const t = now();
  const tx = db.transaction(() => {
    insertMovement(db, { id: crypto.randomUUID(), sku, type: "delete", delta: -item.qty, before_qty: item.qty, after_qty: 0, note: "SKU deleted", by_user: actor.userId ?? null, source: actor.source, ref: null, at: t });
    db.query("DELETE FROM items WHERE sku = ?").run(sku);
  });
  tx();
}

/** Parse the Stock Book / generic CSV export into NewItemInput rows. */
export function parseCsv(text: string): NewItemInput[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length);
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  return parseTable(lines.map(parseLine));
}

/** Rows from a CSV or an Excel sheet: the first non-empty row is the header. */
export function parseTable(table: string[][]): NewItemInput[] {
  const lines = table.filter((r) => r.some((c) => String(c ?? "").trim().length));
  if (lines.length < 2) return [];
  const header = lines[0].map((h) => String(h ?? "").trim().toLowerCase());
  const col = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iBrand = col(["brand"]), iArticle = col(["article", "article no", "name"]), iColour = col(["colour", "color"]);
  const iSize = col(["size"]), iCat = col(["cat", "category", "type"]), iCost = col(["cost", "cost price"]);
  const iMrp = col(["mrp", "price"]), iQty = col(["qty", "quantity", "pairs"]), iLoc = col(["loc", "rack", "location"]);
  if (iBrand < 0 || iArticle < 0 || iQty < 0) throw new StockError(400, "The file needs at least brand, article and qty columns");
  const rows: NewItemInput[] = [];
  for (const c of lines.slice(1)) {
    const get = (i: number) => (i >= 0 ? String(c[i] ?? "").trim() : "");
    const qty = int(get(iQty), NaN);
    if (!Number.isFinite(qty)) continue;
    const rawCat = get(iCat).toLowerCase();
    const cat = (CATEGORIES as readonly string[]).includes(rawCat) ? rawCat : rawCat.startsWith("shoe") ? "shoe" : rawCat.startsWith("boot") ? "boot" : rawCat.startsWith("bag") ? "bag" : rawCat.startsWith("jack") ? "jacket" : rawCat.startsWith("belt") || rawCat.startsWith("wallet") ? "belt" : "shoe";
    rows.push({ brand: get(iBrand), article: get(iArticle), colour: get(iColour) || "-", size: get(iSize) || "-", cat, cost: int(get(iCost)), mrp: int(get(iMrp)), loc: get(iLoc), qty });
  }
  return rows;
}
