import type { Database } from "bun:sqlite";
import { getSetting, getItem, now, type ItemRow, type MovementRow } from "./db";
import { decryptSecret } from "./auth";
import { getLlmConfig } from "./insights";
import { StockError, addStock, applyMovement, normalizeSku, skuFor, type Actor } from "./stock";

/** One line as read from a bill photo or a sales sheet, before a person checks it. */
export interface BillLine {
  text: string;
  qty: number | null;
  brand: string;
  article: string;
  colour: string;
  size: string;
  rate: number | null;
  amount: number | null;
  sku?: string;
}

export interface BillRead {
  kind: "in" | "out" | "unknown";
  supplier: string;
  billNo: string;
  date: string;
  total: number | null;
  notes: string;
  lines: BillLine[];
  /** Plain warnings for the person checking: sums that don't add up, unreadable fields. */
  checks: string[];
}

const PROMPT = `You read photos of purchase bills, delivery challans, handwritten slips (parchi) and sale bills for a footwear, leather and clothing shop in Agra, India. Writing may be English, Hindi or Hinglish, printed or handwritten.
Return ONLY one JSON object, no prose, in this shape:
{"kind":"in"|"out"|"unknown","supplier":string,"billNo":string,"date":"YYYY-MM-DD" or "","total":number or null,"notes":string,
 "lines":[{"text":string,"qty":number or null,"brand":string,"article":string,"colour":string,"size":string,"rate":number or null,"amount":number or null}]}
Rules:
- "in" = goods received by the shop (challan, purchase bill, supplier slip). "out" = goods sold by the shop. "unknown" if you cannot tell.
- One entry in "lines" per item row. "text" is the row exactly as written. Skip signatures, stamps, crossed-out rows and printed headings.
- qty is the number of pairs or pieces. rate is the price of one. amount is the row total. Use digits only, no commas or ₹.
- Split the item into brand, article (model name or number) and colour when the row shows them; leave a part "" when it is not written. Use the shop's own names below when a row clearly means one of them.
- size: only when written for that row (e.g. "8", "6-10", "M"); otherwise "".
- Dates are written day-month-year in India (21-7-26 is 2026-07-21).
- Never guess a number you cannot read: use null and say what was unclear in "notes".`;

const MAX_LINES = 100;
/** A day's sales sheet can be long; addStock takes up to 500 rows at once, so that is the cap everywhere. */
export const MAX_APPLY_LINES = 500;

function str(v: unknown, max = 60): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Pull the first JSON object out of a model reply (models sometimes wrap it in ``` fences). */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new StockError(502, "The AI did not return a readable answer. Try a clearer photo.");
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new StockError(502, "The AI did not return a readable answer. Try a clearer photo.");
  }
}

/** Normalise whatever the model returned and add the arithmetic checks a person should look at. */
export function normaliseRead(raw: unknown): BillRead {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = r.kind === "in" || r.kind === "out" ? r.kind : "unknown";
  const rawLines = Array.isArray(r.lines) ? r.lines.slice(0, MAX_LINES) : [];
  const lines: BillLine[] = rawLines.map((l) => {
    const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    const qty = num(o.qty);
    return {
      text: str(o.text, 120),
      qty: qty === null ? null : Math.round(qty),
      brand: str(o.brand),
      article: str(o.article),
      colour: str(o.colour ?? o.color, 30),
      size: str(o.size, 8),
      rate: num(o.rate),
      amount: num(o.amount),
    };
  });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date ?? "")) ? String(r.date) : "";
  const read: BillRead = { kind, supplier: str(r.supplier), billNo: str(r.billNo, 30), date, total: num(r.total), notes: str(r.notes, 300), lines, checks: [] };
  read.checks = checkSums(read);
  return read;
}

export function checkSums(read: Pick<BillRead, "lines" | "total">): string[] {
  const out: string[] = [];
  read.lines.forEach((l, i) => {
    const row = `Row ${i + 1}`;
    if (l.qty === null) out.push(`${row}: quantity not readable`);
    if (l.qty !== null && l.rate !== null && l.amount !== null && Math.abs(l.qty * l.rate - l.amount) > 1) {
      out.push(`${row}: ${l.qty} × ${l.rate} = ${l.qty * l.rate}, bill says ${l.amount}`);
    }
  });
  const sum = read.lines.reduce((a, l) => a + (l.amount ?? (l.qty !== null && l.rate !== null ? l.qty * l.rate : 0)), 0);
  if (read.total !== null && read.lines.length && Math.abs(sum - read.total) > 1) out.push(`Rows add up to ${sum}, bill total says ${read.total}`);
  return out;
}

/** The shop's own brand/article/colour names, so the model writes "OP AirMix" the way the register does. */
function knownNames(items: ItemRow[]): string {
  const seen = new Set<string>();
  for (const it of items) {
    seen.add([it.brand, it.article, it.colour === "-" ? "" : it.colour].filter(Boolean).join(" / "));
    if (seen.size >= 300) break;
  }
  return [...seen].join("\n");
}

export interface ImageInput {
  mime: string;
  base64: string;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function parseDataUrl(dataUrl: unknown): ImageInput {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m || !IMAGE_TYPES.includes(m[1])) throw new StockError(400, "Send a JPEG, PNG or WebP photo");
  if ((m[2].length * 3) / 4 > MAX_IMAGE_BYTES) throw new StockError(413, "Photo too large (max 6 MB)");
  return { mime: m[1], base64: m[2] };
}

/** Send the photo to the configured AI provider and return what it read. Nothing is saved here. */
export async function readBillPhoto(
  db: Database,
  secret: string,
  image: ImageInput,
  items: ItemRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<BillRead & { model: string }> {
  const cfg = getLlmConfig(db);
  if (cfg.provider === "none" || !cfg.hasKey) throw new StockError(400, "AI is not set up yet. Admin → Insights · AI provider: choose one and paste a key.");
  const stored = getSetting<{ keyEnc?: string }>(db, "llm", {});
  const apiKey = await decryptSecret(secret, stored.keyEnc!);
  const names = knownNames(items);
  const instruction = `${PROMPT}\n\nThe shop's existing items (brand / article / colour):\n${names || "(none yet)"}`;
  const maxTokens = 8000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90000);
  let reply = "";
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetchImpl(`${cfg.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } }, { type: "text", text: instruction }] }],
        }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new StockError(502, `AI provider returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      reply = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    } else {
      // OpenAI-compatible: OpenAI itself and Google Gemini's OpenAI endpoint.
      const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: [{ type: "text", text: instruction }, { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } }] }],
        }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new StockError(502, `AI provider returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      reply = data.choices?.[0]?.message?.content ?? "";
    }
  } catch (e) {
    if (e instanceof StockError) throw e;
    throw new StockError(502, (e as Error).name === "AbortError" ? "The AI took too long. Try again." : `Could not reach the AI: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  return { ...normaliseRead(extractJson(reply)), model: cfg.model };
}

// ---------------------------------------------------------------------------
// Matching a read line to what the shop already has.

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");
const words = (s: string) => s.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

/** How well a line's words match an item, 0..1. Brand and article count most; size only when both have one. */
export function matchScore(line: Pick<BillLine, "brand" | "article" | "colour" | "size" | "text">, it: ItemRow): number {
  const want = squash(`${line.brand}${line.article}`) || squash(line.text);
  const have = squash(`${it.brand}${it.article}`);
  if (!want || !have) return 0;
  let s = 0;
  if (want === have) s = 0.8;
  else if (have.includes(squash(line.article)) && squash(line.article).length >= 3) s = 0.6;
  else {
    const a = new Set(words(`${line.brand} ${line.article} ${line.text}`));
    const b = words(`${it.brand} ${it.article}`);
    const hit = b.filter((w) => a.has(w) || [...a].some((x) => x.length >= 3 && (x.includes(w) || w.includes(x)))).length;
    s = b.length ? (0.6 * hit) / b.length : 0;
  }
  if (s === 0) return 0;
  const colour = squash(line.colour);
  if (colour && it.colour !== "-") s += squash(it.colour).startsWith(colour.slice(0, 3)) ? 0.1 : -0.15;
  if (line.size && it.size !== "-") s += squash(line.size) === squash(it.size) ? 0.1 : -0.3;
  return Math.max(0, Math.min(1, s));
}

export interface Candidate {
  sku: string;
  brand: string;
  article: string;
  colour: string;
  size: string;
  qty: number;
  score: number;
}

export function candidatesFor(line: BillLine, items: ItemRow[], limit = 8): Candidate[] {
  return items
    .map((it) => ({ it, score: matchScore(line, it) }))
    .filter((x) => x.score >= 0.3)
    .sort((a, b) => b.score - a.score || b.it.qty - a.it.qty)
    .slice(0, limit)
    .map(({ it, score }) => ({ sku: it.sku, brand: it.brand, article: it.article, colour: it.colour, size: it.size, qty: it.qty, score: Math.round(score * 100) / 100 }));
}

/** Sales sheet (Excel or CSV): sku or brand/article/colour/size, plus qty. */
export function salesFromTable(table: string[][]): BillLine[] {
  const rows = table.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const col = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iSku = col(["sku", "code"]), iBrand = col(["brand"]), iArticle = col(["article", "article no", "item", "name"]), iColour = col(["colour", "color"]);
  const iSize = col(["size"]), iQty = col(["qty", "quantity", "pairs", "sold"]), iRate = col(["rate", "price", "mrp"]), iAmount = col(["amount", "total"]);
  if (iQty < 0 || (iSku < 0 && iArticle < 0)) throw new StockError(400, "The sheet needs a qty column and either sku or article");
  const out: BillLine[] = [];
  if (rows.length - 1 > MAX_APPLY_LINES) throw new StockError(400, `The sheet has more than ${MAX_APPLY_LINES} rows. Split it into smaller files.`);
  for (const c of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? String(c[i] ?? "").trim() : "");
    const qty = num(get(iQty));
    if (qty === null || qty === 0) continue;
    out.push({
      text: c.map((x) => String(x ?? "").trim()).filter(Boolean).join(" ").slice(0, 120),
      qty: Math.round(qty),
      brand: str(get(iBrand)),
      article: str(get(iArticle)),
      colour: str(get(iColour), 30),
      size: str(get(iSize), 8),
      rate: num(get(iRate)),
      amount: num(get(iAmount)),
      sku: get(iSku) || undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Saving a checked bill, undoing it, listing bills.

export interface BillRow {
  id: string;
  kind: "in" | "out";
  at: string;
  user_id: string | null;
  supplier: string;
  bill_no: string;
  bill_date: string;
  total: number | null;
  units: number;
  lines: number;
  photo_hash: string | null;
  source: string;
  status: "done" | "undone";
  undone_at: string | null;
}

/** One row the person approved. For stock in, `sku` tops up an existing item; without it a new item is made. */
export interface ApplyLine {
  qty: number;
  sku?: string;
  brand?: string;
  article?: string;
  colour?: string;
  rate?: number | null;
  mrp?: number | null;
}

export interface ApplyInput {
  kind: "in" | "out";
  supplier?: string;
  billNo?: string;
  date?: string;
  total?: number | null;
  source?: "photo" | "sheet" | "manual";
  /** Made by the phone when the check screen opens; repeating the same id returns the saved bill instead of applying it twice. */
  id?: string;
  /** SHA-256 of the photo that was read, for the duplicate check even when the photo itself is no longer held. */
  photoHash?: string;
  photo?: { mime: string; bytes: Uint8Array };
  /** Enter a bill whose photo was already entered once. */
  force?: boolean;
  lines: ApplyLine[];
}

export interface ApplyOutcome {
  bill: BillRow;
  results: { sku: string; before: number; after: number; delta: number; created: boolean; short: number }[];
  /** True when this id was already saved and nothing new was applied. */
  replay?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nameKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");

const PHOTO_DAYS = 180;

export function billByPhoto(db: Database, hash: string): BillRow | null {
  return db.query<BillRow, [string]>("SELECT * FROM bills WHERE photo_hash = ? AND status = 'done' ORDER BY at DESC LIMIT 1").get(hash) ?? null;
}

export function getBill(db: Database, id: string): BillRow | null {
  return db.query<BillRow, [string]>("SELECT * FROM bills WHERE id = ?").get(id) ?? null;
}

const posInt = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : 0;
};
const money = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : 0;
};

/** Apply an approved bill in one transaction: every row or none. */
export function applyBill(db: Database, input: ApplyInput, actor: Actor): ApplyOutcome {
  if (input.kind !== "in" && input.kind !== "out") throw new StockError(400, "kind must be in or out");
  const lines = Array.isArray(input.lines) ? input.lines.filter((l) => posInt(l?.qty)) : [];
  if (!lines.length) throw new StockError(400, "No rows with a quantity");
  if (lines.length > MAX_APPLY_LINES) throw new StockError(400, `Too many rows (max ${MAX_APPLY_LINES}). Split the sheet.`);
  const id = input.id && UUID_RE.test(input.id) ? input.id.toLowerCase() : crypto.randomUUID();
  const saved = getBill(db, id);
  if (saved) {
    // The phone sent the same Approve twice (lost reply, double tap): answer with what was saved.
    const moves = db.query<MovementRow, [string]>("SELECT * FROM movements WHERE ref = ? ORDER BY at").all(id);
    return { bill: saved, replay: true, results: moves.map((m) => ({ sku: m.sku, before: m.before_qty, after: m.after_qty, delta: m.delta, created: m.type === "new", short: 0 })) };
  }
  const hash = input.photoHash && /^[0-9a-f]{64}$/.test(input.photoHash) ? input.photoHash : null;
  if (hash && !input.force) {
    const dup = billByPhoto(db, hash);
    if (dup) throw new StockError(409, `This photo was already entered on ${dup.at.slice(0, 10)}. Enter it again only if it is a different delivery.`);
  }
  const supplier = str(input.supplier);
  const billNo = str(input.billNo, 30);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? "")) ? String(input.date) : "";
  const note = (input.kind === "in" ? "Bill in" : "Bill sale") + [supplier && ` · ${supplier}`, billNo && ` #${billNo}`].filter(Boolean).join("");
  const results: ApplyOutcome["results"] = [];
  let units = 0;
  const tx = db.transaction(() => {
    for (const l of lines) {
      const qty = posInt(l.qty);
      const sku = l.sku ? normalizeSku(l.sku) : "";
      if (input.kind === "out") {
        if (!sku) throw new StockError(400, "Every sold row needs an item from stock");
        const it = getItem(db, sku);
        if (!it) throw new StockError(404, `No item with code ${sku}`);
        const r = applyMovement(db, { sku, type: "out", delta: -qty, note: l.rate ? `${note} · ₹${money(l.rate)}` : note, ref: id }, actor);
        results.push({ sku, before: r.movement.before_qty, after: r.movement.after_qty, delta: r.movement.delta, created: false, short: qty + r.movement.delta });
        units += qty;
        continue;
      }
      const existing = sku ? getItem(db, sku) : null;
      if (sku && !existing) throw new StockError(404, `No item with code ${sku}`);
      const row = existing
        ? { brand: existing.brand, article: existing.article, colour: existing.colour, size: existing.size, cat: existing.cat }
        : { brand: str(l.brand) || "-", article: str(l.article), colour: str(l.colour, 30) || "-", size: "-", cat: "shoe" };
      if (!row.article) throw new StockError(400, "Every new item needs a name");
      if (!existing) {
        // The code keeps only the first letters of each part, so two different names can land on one code.
        // Topping up a different article by accident would mix their counts: refuse and say which one.
        const clash = getItem(db, skuFor(row.brand, row.article, row.colour, "-"));
        if (clash && nameKey(`${clash.brand}${clash.article}${clash.colour}`) !== nameKey(`${row.brand}${row.article}${row.colour}`)) {
          throw new StockError(409, `"${[row.brand, row.article, row.colour].filter((x) => x !== "-").join(" ")}" gets the same code as "${[clash.brand, clash.article, clash.colour].filter((x) => x !== "-").join(" ")}" (${clash.sku}). Pick that item under "In stock as", or change the name so they differ in the first letters.`);
        }
      }
      const [r] = addStock(db, [{ ...row, qty, cost: money(l.rate), mrp: money(l.mrp) }], actor, { note, ref: id });
      results.push({ sku: r.item.sku, before: r.movement.before_qty, after: r.movement.after_qty, delta: r.movement.delta, created: r.movement.type === "new", short: 0 });
      units += qty;
    }
    db.query("INSERT INTO bills (id, kind, at, user_id, supplier, bill_no, bill_date, total, units, lines, photo_hash, source, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'done')").run(
      id, input.kind, now(), actor.userId ?? null, supplier, billNo, date, input.total == null ? null : money(input.total), units, lines.length, hash, input.source ?? "manual",
    );
    if (input.photo && hash) {
      db.query("INSERT INTO bill_photos (bill_id, mime, data, at) VALUES (?,?,?,?)").run(id, input.photo.mime, input.photo.bytes, now());
    }
    db.query("DELETE FROM bill_photos WHERE at < ?").run(new Date(Date.now() - PHOTO_DAYS * 86400000).toISOString());
  });
  tx();
  return { bill: getBill(db, id)!, results };
}

/** Put stock back the way it was before a bill. Items made by the bill stay, at their earlier quantity. */
export function undoBill(db: Database, id: string, actor: Actor): BillRow {
  const bill = getBill(db, id);
  if (!bill) throw new StockError(404, "Bill not found");
  if (bill.status === "undone") throw new StockError(409, "This bill was already undone");
  const moves = db.query<MovementRow, [string]>("SELECT * FROM movements WHERE ref = ? ORDER BY at").all(id);
  const tx = db.transaction(() => {
    for (const m of moves) {
      if (!m.delta || !getItem(db, m.sku)) continue;
      applyMovement(db, { sku: m.sku, type: "adj", delta: -m.delta, note: `Undo bill${bill.bill_no ? " #" + bill.bill_no : ""}`, ref: `undo:${id}` }, actor);
    }
    db.query("UPDATE bills SET status = 'undone', undone_at = ? WHERE id = ?").run(now(), id);
  });
  tx();
  return getBill(db, id)!;
}

export function listBills(db: Database, limit = 100) {
  return db
    .query<BillRow & { by_name: string | null; has_photo: number }, [number]>(
      "SELECT b.*, u.name AS by_name, (SELECT COUNT(*) FROM bill_photos p WHERE p.bill_id = b.id) AS has_photo FROM bills b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.at DESC LIMIT ?",
    )
    .all(limit);
}

export function billPhoto(db: Database, id: string): { mime: string; data: Uint8Array } | null {
  return db.query<{ mime: string; data: Uint8Array }, [string]>("SELECT mime, data FROM bill_photos WHERE bill_id = ?").get(id) ?? null;
}

/**
 * Movements as reports should count them: an undone bill and its undo cancel out,
 * so neither the sale nor the reversal shows up in "sold" or "received".
 */
export function withoutUndone(db: Database, moves: MovementRow[]): MovementRow[] {
  const undone = new Set(db.query<{ id: string }, []>("SELECT id FROM bills WHERE status = 'undone'").all().map((r) => r.id));
  if (!undone.size) return moves;
  return moves.filter((m) => !(m.ref && (undone.has(m.ref) || (m.ref.startsWith("undo:") && undone.has(m.ref.slice(5))))));
}

export async function sha256Hex(base64: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", Buffer.from(base64, "base64"));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
