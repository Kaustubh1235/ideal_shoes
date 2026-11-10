import type { Database } from "bun:sqlite";
import { now, type ItemRow, type MovementRow } from "./db";
import * as R from "./reports";
import { StockError } from "./stock";

/**
 * Suggestions are picked by plain rules over the stock and the last 30 days of sales, not by the AI,
 * so they are the same every time and cost nothing. The person approves or dismisses each one.
 *  - reorder: sold 3+ in 30 days and less than about two weeks of sales left
 *  - sale:    dead stock (180+ days in, nothing sold), biggest money first
 *  - count:   selling well and not counted in 30 days, so the book stays right
 */
export type SuggestionKind = "reorder" | "sale" | "count";

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  sku: string;
  brand: string;
  article: string;
  colour: string;
  qty: number;
  sold30: number;
  suggestQty: number;
  value: number;
  ageDays: number;
}

const DAY = 86400000;
const QUIET_DAYS = 14;

export function computeSuggestions(db: Database, items: ItemRow[], moves30: MovementRow[], nowMs = Date.now()): Suggestion[] {
  const sold = new Map<string, number>();
  for (const m of moves30) if (m.type === "out") sold.set(m.sku, (sold.get(m.sku) ?? 0) - m.delta);
  const since = new Date(nowMs - QUIET_DAYS * DAY).toISOString();
  const quiet = new Set(db.query<{ kind: string; target: string }, [string]>("SELECT kind, target FROM suggestions WHERE at >= ?").all(since).map((r) => `${r.kind}:${r.target}`));
  const out: Suggestion[] = [];
  const base = (kind: SuggestionKind, it: ItemRow, extra: Partial<Suggestion> = {}): Suggestion => ({
    id: `${kind}:${it.sku}`, kind, sku: it.sku, brand: it.brand, article: it.article, colour: it.colour, qty: it.qty,
    sold30: sold.get(it.sku) ?? 0, suggestQty: 0, value: R.valueAtCost(it), ageDays: R.ageDays(it, nowMs), ...extra,
  });
  const reorder = items
    .filter((it) => (sold.get(it.sku) ?? 0) >= 3 && it.qty < (sold.get(it.sku) ?? 0) / 2)
    .sort((a, b) => (sold.get(b.sku) ?? 0) - (sold.get(a.sku) ?? 0))
    .map((it) => base("reorder", it, { suggestQty: Math.max(1, (sold.get(it.sku) ?? 0) - it.qty) }));
  const sale = R.deadStock(items, nowMs, 20).map((it) => base("sale", it));
  const count = items
    .filter((it) => (sold.get(it.sku) ?? 0) >= 3 && it.qty > 0 && (!it.last_count || nowMs - Date.parse(it.last_count) > 30 * DAY))
    .sort((a, b) => (sold.get(b.sku) ?? 0) - (sold.get(a.sku) ?? 0))
    .map((it) => base("count", it));
  for (const list of [reorder.slice(0, 5), sale.slice(0, 3), count.slice(0, 3)]) for (const s of list) if (!quiet.has(s.id)) out.push(s);
  return out;
}

export function decideSuggestion(db: Database, id: string, decision: "approve" | "dismiss", userId: string | null, qty?: number): void {
  const m = /^(reorder|sale|count):([A-Z0-9-]{1,80})$/.exec(id);
  if (!m) throw new StockError(400, "Unknown suggestion");
  if (decision !== "approve" && decision !== "dismiss") throw new StockError(400, "decision must be approve or dismiss");
  const n = Math.round(Number(qty));
  db.query("INSERT INTO suggestions (id, kind, target, status, qty, at, user_id) VALUES (?,?,?,?,?,?,?)").run(
    crypto.randomUUID(), m[1], m[2], decision === "approve" ? "approved" : "dismissed", Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : null, now(), userId,
  );
}

/** Approved reorders from the last 30 days whose item has not had stock in since. */
export function toOrder(db: Database, items: ItemRow[], nowMs = Date.now()) {
  const byKey = new Map(items.map((i) => [i.sku, i]));
  const rows = db
    .query<{ target: string; qty: number | null; at: string }, [string]>("SELECT target, qty, at FROM suggestions WHERE kind = 'reorder' AND status = 'approved' AND at >= ? ORDER BY at DESC")
    .all(new Date(nowMs - 30 * DAY).toISOString());
  const seen = new Set<string>();
  const out: { sku: string; brand: string; article: string; colour: string; qty: number; approvedAt: string; inStock: number }[] = [];
  for (const r of rows) {
    const it = byKey.get(r.target);
    if (!it || seen.has(r.target)) continue;
    seen.add(r.target);
    if (it.last_in && it.last_in > r.at) continue; // it came in after the approval
    out.push({ sku: it.sku, brand: it.brand, article: it.article, colour: it.colour, qty: r.qty ?? 0, approvedAt: r.at, inStock: it.qty });
  }
  return out;
}
