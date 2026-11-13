/**
 * Score an AI's bill reads against e2e/bills/truth.json, through the app's own parsing and sum checks.
 *   bun e2e/bills/score.ts <dir with bill-NN.json replies>    (NN = the photo's number)
 * A field is right when it equals the truth (qty, rate, amount) or names the same thing (item: same
 * words, ignoring case, spaces and order). Rows the AI made up (e.g. a crossed-out line) count as wrong.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractJson, normaliseRead, type BillLine } from "../../apps/inventory/src/bills";

type TruthRow = { qty: number; item: string; rate: number | null; amount: number | null };
type Truth = { file: string; kind: string; supplier: string; date: string; sumsOk: boolean; rows: TruthRow[] };

const dir = process.argv[2];
const truth: Truth[] = JSON.parse(readFileSync(join(import.meta.dir, "truth.json"), "utf8"));
const norm = (s: string) => s.toLowerCase().normalize("NFC").split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).sort().join(" ");
const itemOf = (l: BillLine) => [l.brand, l.article, l.colour].filter(Boolean).join(" ") || l.text;
const sameItem = (a: string, b: string) => norm(a) === norm(b);

let fields = 0, right = 0, rowsTotal = 0, rowsRight = 0, billsRight = 0, extra = 0, flaggedOk = 0;
const lines: string[] = [];
for (const t of truth) {
  const nn = t.file.slice(0, 2);
  const f = join(dir, `bill-${nn}.json`);
  if (!existsSync(f)) { lines.push(`${t.file}: no answer`); continue; }
  const read = normaliseRead(extractJson(readFileSync(f, "utf8")));
  const pool = [...read.lines];
  const misses: string[] = [];
  let billOk = read.kind === t.kind;
  if (!billOk) misses.push(`kind ${read.kind}≠${t.kind}`);
  for (const tr of t.rows) {
    // the AI row that best fits this true row
    let best = -1, bestScore = -1;
    pool.forEach((l, i) => { const sc = (l.qty === tr.qty ? 1 : 0) + (l.rate === tr.rate ? 1 : 0) + (sameItem(itemOf(l), tr.item) ? 2 : 0); if (sc > bestScore) { bestScore = sc; best = i; } });
    const l = best >= 0 && bestScore > 0 ? pool.splice(best, 1)[0] : null;
    const checks: [string, boolean][] = [["qty", l?.qty === tr.qty], ["item", !!l && sameItem(itemOf(l), tr.item)], ["rate", l ? l.rate === tr.rate : false], ["amount", l ? l.amount === tr.amount : false]];
    rowsTotal++;
    let rowOk = true;
    for (const [name, ok] of checks) { fields++; if (ok) right++; else { rowOk = false; misses.push(`${tr.item}: ${name} ${l ? JSON.stringify(name === "item" ? itemOf(l) : (l as any)[name]) : "missing row"}≠${JSON.stringify(name === "item" ? tr.item : (tr as any)[name])}`); } }
    if (rowOk) rowsRight++; else billOk = false;
  }
  for (const l of pool) { extra++; billOk = false; misses.push(`extra row "${l.text || itemOf(l)}"`); }
  // A warning is right when the paper's sums are wrong, or when the AI misread a number (the warning is what makes Papa look).
  const flagged = read.checks.length > 0;
  const misreadNumber = misses.some((m) => / (qty|rate|amount) /.test(m));
  const shouldFlag = !t.sumsOk || misreadNumber;
  if (flagged === shouldFlag) { flaggedOk++; if (flagged && t.sumsOk) misses.push(`caught by the sum check: ${read.checks[0]}`); }
  else misses.push(shouldFlag ? (t.sumsOk ? "misread NOT caught by the sum check" : "sum mistake NOT flagged") : `false alarm: ${read.checks[0]}`);
  if (billOk) billsRight++;
  lines.push(`${billOk ? "✓" : "✗"} ${t.file}${misses.length ? "  " + misses.join("; ") : ""}`);
}
console.log(lines.join("\n"));
console.log(`\nfields right: ${right}/${fields} (${((100 * right) / fields).toFixed(1)}%)  rows fully right: ${rowsRight}/${rowsTotal}  bills fully right: ${billsRight}/${truth.length}  made-up rows: ${extra}  sum checks correct: ${flaggedOk}/${truth.length}`);
