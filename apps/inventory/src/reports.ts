import type { ItemRow, MovementRow } from "./db";

const DAY = 86400000;
export const DEAD_DAYS = 180;

export function ageDays(it: ItemRow, nowMs = Date.now()): number {
  const ref = it.last_in || it.created_at;
  return Math.max(0, Math.floor((nowMs - Date.parse(ref)) / DAY));
}

export function isDead(it: ItemRow, nowMs = Date.now()): boolean {
  if (it.qty <= 0) return false;
  if (ageDays(it, nowMs) < DEAD_DAYS) return false;
  if (it.last_out && (nowMs - Date.parse(it.last_out)) / DAY < DEAD_DAYS) return false;
  return true;
}

export function valueAtCost(it: ItemRow): number {
  return (it.qty || 0) * (it.cost || 0);
}

export interface Summary {
  skus: number;
  units: number;
  valueAtCost: number;
  retailValue: number;
  deadValue: number;
  deadUnits: number;
  zeroStockSkus: number;
  lowStockSkus: number;
}

export function summary(items: ItemRow[], nowMs = Date.now()): Summary {
  const s: Summary = { skus: 0, units: 0, valueAtCost: 0, retailValue: 0, deadValue: 0, deadUnits: 0, zeroStockSkus: 0, lowStockSkus: 0 };
  for (const it of items) {
    s.skus++;
    s.units += it.qty;
    s.valueAtCost += valueAtCost(it);
    s.retailValue += it.qty * (it.mrp || 0);
    if (isDead(it, nowMs)) {
      s.deadValue += valueAtCost(it);
      s.deadUnits += it.qty;
    }
    if (it.qty === 0) s.zeroStockSkus++;
    else if (it.qty <= 1) s.lowStockSkus++;
  }
  return s;
}

export interface AgeBucket {
  name: string;
  lo: number;
  hi: number;
  units: number;
  value: number;
  skus: number;
}

export function ageing(items: ItemRow[], nowMs = Date.now()): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { name: "0–90 days", lo: 0, hi: 90, units: 0, value: 0, skus: 0 },
    { name: "91–180 days", lo: 91, hi: 180, units: 0, value: 0, skus: 0 },
    { name: "181–365 days", lo: 181, hi: 365, units: 0, value: 0, skus: 0 },
    { name: "Over a year", lo: 366, hi: Number.MAX_SAFE_INTEGER, units: 0, value: 0, skus: 0 },
  ];
  for (const it of items) {
    if (it.qty <= 0) continue;
    const a = ageDays(it, nowMs);
    const b = buckets.find((x) => a >= x.lo && a <= x.hi) ?? buckets[3];
    b.units += it.qty;
    b.value += valueAtCost(it);
    b.skus++;
  }
  return buckets;
}

export interface BrandRow {
  brand: string;
  skus: number;
  units: number;
  value: number;
  deadValue: number;
}

export function byBrand(items: ItemRow[], nowMs = Date.now()): BrandRow[] {
  const m = new Map<string, BrandRow>();
  for (const it of items) {
    const r = m.get(it.brand) ?? { brand: it.brand, skus: 0, units: 0, value: 0, deadValue: 0 };
    r.skus++;
    r.units += it.qty;
    r.value += valueAtCost(it);
    if (isDead(it, nowMs)) r.deadValue += valueAtCost(it);
    m.set(it.brand, r);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

export function byCategory(items: ItemRow[]): { cat: string; skus: number; units: number; value: number }[] {
  const m = new Map<string, { cat: string; skus: number; units: number; value: number }>();
  for (const it of items) {
    const r = m.get(it.cat) ?? { cat: it.cat, skus: 0, units: 0, value: 0 };
    r.skus++;
    r.units += it.qty;
    r.value += valueAtCost(it);
    m.set(it.cat, r);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

export function deadStock(items: ItemRow[], nowMs = Date.now(), limit = 100): (ItemRow & { ageDays: number; value: number })[] {
  return items
    .filter((it) => isDead(it, nowMs))
    .map((it) => ({ ...it, ageDays: ageDays(it, nowMs), value: valueAtCost(it) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface TrendDay {
  day: string;
  sold: number;
  received: number;
  counted: number;
}

/** Daily sold / received units for the last `days` days, oldest first. */
export function trend(movements: MovementRow[], days = 30, nowMs = Date.now()): TrendDay[] {
  const out: TrendDay[] = [];
  const index = new Map<string, TrendDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * DAY).toISOString().slice(0, 10);
    const row = { day: d, sold: 0, received: 0, counted: 0 };
    out.push(row);
    index.set(d, row);
  }
  for (const m of movements) {
    const row = index.get(m.at.slice(0, 10));
    if (!row) continue;
    if (m.type === "out") row.sold += -m.delta;
    else if (m.type === "in" || m.type === "new") row.received += m.delta;
    else if (m.type === "count") row.counted += 1;
  }
  return out;
}

export interface MoverRow {
  sku: string;
  name: string;
  sold: number;
  qty: number;
}

export function topMovers(items: ItemRow[], movements: MovementRow[], limit = 10): MoverRow[] {
  const sold = new Map<string, number>();
  for (const m of movements) if (m.type === "out") sold.set(m.sku, (sold.get(m.sku) ?? 0) + -m.delta);
  const byKey = new Map(items.map((i) => [i.sku, i]));
  return [...sold.entries()]
    .map(([sku, n]) => {
      const it = byKey.get(sku);
      return { sku, name: it ? `${it.brand} ${it.article} ${it.colour} ${it.size !== "-" ? it.size : ""}`.trim() : sku, sold: n, qty: it?.qty ?? 0 };
    })
    .sort((a, b) => b.sold - a.sold)
    .slice(0, limit);
}

export interface SizeGap {
  key: string;
  brand: string;
  article: string;
  colour: string;
  have: string[];
  missing: string[];
  sold30: number;
}

/**
 * Footwear-specific: for each article+colour that sells, which sizes of the standard
 * run are at zero. A broken size run is the usual reason a good article stops selling.
 */
export function sizeGaps(items: ItemRow[], movements: MovementRow[], run: string[], limit = 20): SizeGap[] {
  const groups = new Map<string, ItemRow[]>();
  for (const it of items) {
    if (it.cat !== "shoe" && it.cat !== "boot") continue;
    const k = `${it.brand}|${it.article}|${it.colour}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
  }
  const sold = new Map<string, number>();
  for (const m of movements) if (m.type === "out") sold.set(m.sku, (sold.get(m.sku) ?? 0) + -m.delta);
  const out: SizeGap[] = [];
  for (const [k, rows] of groups) {
    const have = rows.filter((r) => r.qty > 0).map((r) => r.size);
    const present = new Set(rows.map((r) => r.size));
    const missing = run.filter((s) => present.has(s) ? rows.find((r) => r.size === s)!.qty === 0 : false);
    const sold30 = rows.reduce((a, r) => a + (sold.get(r.sku) ?? 0), 0);
    if (missing.length === 0) continue;
    const [brand, article, colour] = k.split("|");
    out.push({ key: k, brand, article, colour, have, missing, sold30 });
  }
  return out.sort((a, b) => b.sold30 - a.sold30 || b.missing.length - a.missing.length).slice(0, limit);
}

/** Compact, LLM-friendly digest of the whole stock position. */
export function digest(items: ItemRow[], movements30: MovementRow[], run: string[], nowMs = Date.now()) {
  return {
    asOf: new Date(nowMs).toISOString(),
    summary: summary(items, nowMs),
    ageing: ageing(items, nowMs),
    byBrand: byBrand(items, nowMs).slice(0, 15),
    byCategory: byCategory(items),
    deadStock: deadStock(items, nowMs, 15).map((d) => ({ sku: d.sku, brand: d.brand, article: d.article, colour: d.colour, size: d.size, qty: d.qty, ageDays: d.ageDays, value: d.value })),
    topMovers30d: topMovers(items, movements30, 10),
    sizeGaps: sizeGaps(items, movements30, run, 10),
    last30d: trend(movements30, 30, nowMs).reduce(
      (a, d) => ({ sold: a.sold + d.sold, received: a.received + d.received, counts: a.counts + d.counted }),
      { sold: 0, received: 0, counts: 0 },
    ),
  };
}
