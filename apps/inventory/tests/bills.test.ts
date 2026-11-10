import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { createApp, type App } from "../src/app";
import { checkSums, extractJson, normaliseRead, candidatesFor, salesFromTable, matchScore } from "../src/bills";
import { writeXlsx } from "../src/xlsx";
import type { ItemRow } from "../src/db";

const PUBLIC = join(import.meta.dir, "..", "public");

// The real challan from the shop (21-7-26): 48 pairs of OP AirMix at ₹355.
const CHALLAN_REPLY = {
  kind: "in",
  supplier: "",
  billNo: "",
  date: "2026-07-21",
  total: 17040,
  notes: "Supplier name box is empty; 'Meenu' is printed at the bottom.",
  lines: [{ text: "48 OP AirMix 355 17040", qty: 48, brand: "OP", article: "AirMix", colour: "", size: "", rate: 355, amount: 17040 }],
};

/** A fake AI provider: records what it was sent and answers with `reply`. */
function fakeAi(reply: unknown, format: "openai" | "anthropic" = "openai") {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    const text = typeof reply === "string" ? reply : "```json\n" + JSON.stringify(reply) + "\n```";
    const data = format === "openai" ? { choices: [{ message: { content: text } }] } : { content: [{ type: "text", text }] };
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

// A tiny valid JPEG header is enough: the server only checks type, size and base64.
const PHOTO = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-bytes-for-the-challan").toString("base64");
const PHOTO2 = "data:image/jpeg;base64," + Buffer.from("another-photo").toString("base64");

let ai = fakeAi(CHALLAN_REPLY);
let app: App;
let owner = "";
let staff = "";

async function call(method: string, path: string, body?: unknown, cookie = owner, raw?: { type: string; data: BodyInit }) {
  const headers: Record<string, string> = { "x-requested-with": "StockRoom" };
  if (cookie) headers.cookie = cookie;
  if (raw) headers["content-type"] = raw.type;
  else if (body !== undefined) headers["content-type"] = "application/json";
  const res = await app.fetch(new Request(`https://stock.test${path}`, { method, headers, body: raw ? raw.data : body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

beforeAll(async () => {
  app = createApp({
    dbPath: ":memory:",
    secret: "test-secret-test-secret-test-secret-xx",
    publicDir: PUBLIC,
    version: "test",
    log: () => {},
    fetchImpl: ((u: string, i: RequestInit) => ai.fn(u, i)) as unknown as typeof fetch,
    rateLimits: { billReads: { max: 12, windowMs: 60_000 } },
  });
  const r = await call("POST", "/api/v1/auth/setup", { name: "Papa", pin: "2468" }, "");
  owner = r.headers.get("set-cookie")!.split(";")[0];
  await call("POST", "/api/v1/admin/users", { name: "Raju", pin: "1357", role: "staff" });
  const state = await call("GET", "/api/v1/auth/state", undefined, "");
  const raju = state.data.users.find((u: any) => u.name === "Raju");
  const l = await call("POST", "/api/v1/auth/login", { userId: raju.id, pin: "1357" }, "");
  staff = l.headers.get("set-cookie")!.split(";")[0];
});

describe("reading what the AI returns", () => {
  test("takes JSON out of code fences and ignores chatter around it", () => {
    expect(extractJson('Sure! ```json\n{"a":1}\n``` done')).toEqual({ a: 1 });
  });
  test("a reply with no JSON is a clear error, not a crash", () => {
    expect(() => extractJson("I cannot read this")).toThrow(/readable answer/);
  });
  test("junk values become blanks, never guesses", () => {
    const r = normaliseRead({ kind: "maybe", date: "21/7/26", lines: [{ text: "x", qty: "four", rate: "₹1,250", amount: -5 }] });
    expect(r.kind).toBe("unknown");
    expect(r.date).toBe("");
    expect(r.lines[0].qty).toBeNull();
    expect(r.lines[0].rate).toBe(1250);
    expect(r.lines[0].amount).toBeNull();
    expect(r.checks).toContain("Row 1: quantity not readable");
  });
  test("the real challan adds up: 48 × 355 = 17,040", () => {
    expect(normaliseRead(CHALLAN_REPLY).checks).toEqual([]);
  });
  test("a misread amount and a wrong total are both flagged", () => {
    const checks = checkSums({ total: 20000, lines: [{ text: "", qty: 48, rate: 355, amount: 17400, brand: "", article: "", colour: "", size: "" }] });
    expect(checks[0]).toContain("48 × 355 = 17040, bill says 17400");
    expect(checks[1]).toContain("bill total says 20000");
  });
  test("at most 100 rows are kept", () => {
    const r = normaliseRead({ lines: Array.from({ length: 150 }, () => ({ qty: 1 })) });
    expect(r.lines.length).toBe(100);
  });
});

describe("matching a bill row to stock", () => {
  const item = (brand: string, article: string, colour = "-", qty = 1): ItemRow => ({ sku: `${brand}-${article}`.toUpperCase().replace(/[^A-Z0-9-]/g, ""), brand, article, colour, size: "-", cat: "shoe", cost: 0, mrp: 0, qty, loc: "", created_at: "", last_in: null, last_out: null, last_count: null, updated_at: "" });
  const stock = [item("OP", "AirMix", "-", 6), item("Paragon", "Slipper"), item("Bata", "Comfit")];
  test("'OP Airmix' written by hand finds OP AirMix", () => {
    const c = candidatesFor({ text: "48 OP Airmix", qty: 48, brand: "OP", article: "Airmix", colour: "", size: "", rate: 355, amount: null }, stock);
    expect(c[0].article).toBe("AirMix");
  });
  test("a name alone in the text still matches", () => {
    const c = candidatesFor({ text: "paragon slipper 12 pr", qty: 12, brand: "", article: "", colour: "", size: "", rate: null, amount: null }, stock);
    expect(c[0].brand).toBe("Paragon");
  });
  test("something new matches nothing", () => {
    expect(candidatesFor({ text: "Ladies sandal gold", qty: 5, brand: "", article: "Ladies sandal", colour: "gold", size: "", rate: 310, amount: null }, stock)).toEqual([]);
  });
  test("a different size on both sides lowers the score", () => {
    const sized = { ...stock[0], size: "8" };
    expect(matchScore({ brand: "OP", article: "AirMix", colour: "", size: "9", text: "" }, sized)).toBeLessThan(matchScore({ brand: "OP", article: "AirMix", colour: "", size: "8", text: "" }, sized));
  });
});

describe("sales sheet", () => {
  test("reads sku or article plus qty, skips rows without a quantity", () => {
    const rows = salesFromTable([["Item", "Qty", "Rate"], ["OP AirMix", "3", "650"], ["Paragon slipper", "", "120"], ["", "", ""]]);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ article: "OP AirMix", qty: 3, rate: 650 });
  });
  test("a sheet with no qty column is refused with a plain message", () => {
    expect(() => salesFromTable([["item", "price"], ["x", "1"]])).toThrow(/qty column/);
  });
});

describe("bill photo → check → approve", () => {
  let photoId = "";
  let billId = "";
  let sku = "";

  test("without an AI key the read says how to set it up", async () => {
    const r = await call("POST", "/api/v1/bills/read", { photo: PHOTO });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("AI is not set up");
  });

  test("Gemini can be chosen and the key never comes back to the browser", async () => {
    const r = await call("PUT", "/api/v1/admin/settings", { llm: { provider: "gemini", apiKey: "AIza-test-key-123" } });
    expect(r.status).toBe(200);
    expect(r.data.settings.llm).toMatchObject({ provider: "gemini", hasKey: true, model: "gemini-2.5-flash" });
    expect(JSON.stringify(r.data)).not.toContain("AIza-test-key-123");
  });

  test("staff cannot change the AI settings", async () => {
    expect((await call("PUT", "/api/v1/admin/settings", { llm: { provider: "none" } }, staff)).status).toBe(403);
  });

  test("not a photo, or too big, is refused before any AI call", async () => {
    const before = ai.calls.length;
    expect((await call("POST", "/api/v1/bills/read", { photo: "data:text/html;base64,PGgxPg==" })).status).toBe(400);
    expect((await call("POST", "/api/v1/bills/read", { photo: "https://evil.example/x.jpg" })).status).toBe(400);
    const big = "data:image/jpeg;base64," + "A".repeat(8.5 * 1024 * 1024);
    expect((await call("POST", "/api/v1/bills/read", { photo: big })).status).toBe(413);
    expect(ai.calls.length).toBe(before);
  });

  test("the photo goes to Gemini's OpenAI endpoint with the key as a bearer token", async () => {
    const r = await call("POST", "/api/v1/bills/read", { photo: PHOTO });
    expect(r.status).toBe(200);
    const c = ai.calls.at(-1)!;
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(c.headers.authorization).toBe("Bearer AIza-test-key-123");
    expect(c.body.model).toBe("gemini-2.5-flash");
    expect(c.body.messages[0].content[1].image_url.url).toBe(PHOTO);
    expect(r.data.lines[0]).toMatchObject({ qty: 48, article: "AirMix", rate: 355, amount: 17040 });
    expect(r.data.checks).toEqual([]);
    expect(r.data.alreadyEntered).toBeNull();
    expect(r.data.photoId).toMatch(/^[0-9a-f]{64}$/);
    photoId = r.data.photoId;
  });

  test("reading saves nothing: stock is still empty", async () => {
    expect((await call("GET", "/api/v1/items")).data.items.length).toBe(0);
  });

  test("approve adds 48 pairs as a new article, with the bill and its photo", async () => {
    const r = await call("POST", "/api/v1/bills/apply", { kind: "in", source: "photo", photoId, supplier: "Meenu", date: "2026-07-21", total: 17040, lines: [{ qty: 48, brand: "OP", article: "AirMix", rate: 355 }] });
    expect(r.status).toBe(200);
    expect(r.data.bill).toMatchObject({ kind: "in", units: 48, lines: 1, supplier: "Meenu", status: "done", source: "photo" });
    expect(r.data.items[0]).toMatchObject({ brand: "OP", article: "AirMix", colour: "-", size: "-", qty: 48, cost: 355 });
    expect(r.data.results[0].created).toBe(true);
    billId = r.data.bill.id;
    sku = r.data.items[0].sku;
    expect(sku).toBe("OP-AIRMIX");
    const photo = await app.fetch(new Request(`https://stock.test/api/v1/bills/${billId}/photo`, { headers: { cookie: owner } }));
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await photo.arrayBuffer()).toString()).toBe("fake-jpeg-bytes-for-the-challan");
  });

  test("the movement points at the bill", async () => {
    const r = await call("GET", `/api/v1/items/${sku}`);
    expect(r.data.movements[0]).toMatchObject({ type: "new", delta: 48, ref: billId, source: "bill" });
    expect(r.data.movements[0].note).toContain("Meenu");
  });

  test("the same photo again is caught; a second delivery can still be entered on purpose", async () => {
    const read = await call("POST", "/api/v1/bills/read", { photo: PHOTO });
    expect(read.data.alreadyEntered).not.toBeNull();
    expect(read.data.lines[0].candidates[0].sku).toBe(sku);
    const dup = await call("POST", "/api/v1/bills/apply", { kind: "in", photoId: read.data.photoId, lines: [{ qty: 48, sku }] });
    expect(dup.status).toBe(409);
    expect(dup.data.error).toContain("already entered");
    expect((await call("GET", `/api/v1/items/${sku}`)).data.item.qty).toBe(48);
  });

  test("a sales sheet matches by name and approve takes stock out", async () => {
    const file = writeXlsx([{ name: "Sales", rows: [{ item: "OP AirMix", qty: 3, rate: 650 }], cols: [{ key: "item", label: "item" }, { key: "qty", label: "qty" }, { key: "rate", label: "rate" }] }]);
    const read = await call("POST", "/api/v1/bills/read-sheet?format=xlsx", undefined, owner, { type: "application/octet-stream", data: file });
    expect(read.status).toBe(200);
    expect(read.data.lines[0].candidates[0].sku).toBe(sku);
    const r = await call("POST", "/api/v1/bills/apply", { kind: "out", source: "sheet", lines: [{ qty: 3, sku, rate: 650 }] }, staff);
    expect(r.status).toBe(200);
    expect(r.data.items[0].qty).toBe(45);
  });

  test("a sold row must be an item in stock, and nothing is half-saved", async () => {
    const r = await call("POST", "/api/v1/bills/apply", { kind: "out", lines: [{ qty: 1, sku }, { qty: 1, sku: "NOPE-NOTHING" }] });
    expect(r.status).toBe(404);
    expect((await call("GET", `/api/v1/items/${sku}`)).data.item.qty).toBe(45);
    expect((await call("POST", "/api/v1/bills/apply", { kind: "out", lines: [{ qty: 1 }] })).status).toBe(400);
    expect((await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 0, article: "X" }] })).status).toBe(400);
  });

  test("selling more than the book has stops at zero and says how many were short", async () => {
    await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 2, article: "Paragon Slipper", rate: 140 }] });
    const r = await call("POST", "/api/v1/bills/apply", { kind: "out", lines: [{ qty: 5, sku: "PARAGONS" }] });
    expect(r.status).toBe(200);
    expect(r.data.results[0]).toMatchObject({ after: 0, short: 3 });
  });

  test("staff can undo their own bill; undoing twice is refused", async () => {
    const mine = await call("POST", "/api/v1/bills/apply", { kind: "out", lines: [{ qty: 5, sku }] }, staff);
    expect(mine.data.items[0].qty).toBe(40);
    const u = await call("POST", `/api/v1/bills/${mine.data.bill.id}/undo`, undefined, staff);
    expect(u.status).toBe(200);
    expect(u.data.bill.status).toBe("undone");
    expect((await call("GET", `/api/v1/items/${sku}`)).data.item.qty).toBe(45);
    expect((await call("POST", `/api/v1/bills/${mine.data.bill.id}/undo`, undefined, staff)).status).toBe(409);
  });

  test("staff cannot undo the owner's bill", async () => {
    expect((await call("POST", `/api/v1/bills/${billId}/undo`, undefined, staff)).status).toBe(403);
  });

  test("an undone sale does not count as sold in the reports", async () => {
    const d = await call("GET", "/api/v1/reports/dashboard?days=30");
    const sold = d.data.trend.reduce((a: number, x: any) => a + x.sold, 0);
    expect(sold).toBe(3 + 2); // the sheet sale and the slipper sale; the undone 5 is gone
  });

  test("the bill list shows who entered what", async () => {
    const r = await call("GET", "/api/v1/bills");
    expect(r.data.bills.length).toBe(5);
    expect(r.data.bills.find((b: any) => b.id === billId)).toMatchObject({ by_name: "Papa", has_photo: 1 });
  });

  test("bills need sign-in and the app header", async () => {
    expect((await call("GET", "/api/v1/bills", undefined, "")).status).toBe(401);
    const res = await app.fetch(new Request("https://stock.test/api/v1/bills/apply", { method: "POST", headers: { cookie: owner, "content-type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(403);
  });

  test("Claude reads the photo with its own image format", async () => {
    await call("PUT", "/api/v1/admin/settings", { llm: { provider: "anthropic", apiKey: "sk-ant-test" } });
    ai = fakeAi(CHALLAN_REPLY, "anthropic");
    const r = await call("POST", "/api/v1/bills/read", { photo: PHOTO2 });
    expect(r.status).toBe(200);
    const c = ai.calls.at(-1)!;
    expect(c.url).toBe("https://api.anthropic.com/v1/messages");
    expect(c.headers["x-api-key"]).toBe("sk-ant-test");
    expect(c.body.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(r.data.lines[0].qty).toBe(48);
  });

  test("a provider error comes back as a plain 502", async () => {
    ai = { fn: (async () => new Response("quota exceeded", { status: 429 })) as unknown as typeof fetch, calls: [] };
    const r = await call("POST", "/api/v1/bills/read", { photo: PHOTO2 });
    expect(r.status).toBe(502);
    expect(r.data.error).toContain("429");
    ai = fakeAi(CHALLAN_REPLY, "anthropic");
  });

  test("photo reads are limited per person", async () => {
    let last = 0;
    for (let i = 0; i < 14; i++) last = (await call("POST", "/api/v1/bills/read", { photo: PHOTO2 }, staff)).status;
    expect(last).toBe(429);
  });
});

describe("suggestions", () => {
  test("a fast seller running low is suggested for reorder, and approving puts it on the To order list", async () => {
    const add = await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 10, article: "School shoe black", rate: 240 }] });
    const s = add.data.items[0].sku;
    await call("POST", "/api/v1/bills/apply", { kind: "out", lines: [{ qty: 8, sku: s }] });
    const r = await call("GET", "/api/v1/suggestions");
    const sug = r.data.suggestions.find((x: any) => x.id === `reorder:${s}`);
    expect(sug).toMatchObject({ kind: "reorder", qty: 2, sold30: 8, suggestQty: 6 });
    expect((await call("POST", `/api/v1/suggestions/${encodeURIComponent(sug.id)}`, { decision: "approve", qty: 12 })).status).toBe(200);
    const after = await call("GET", "/api/v1/suggestions");
    expect(after.data.suggestions.find((x: any) => x.id === sug.id)).toBeUndefined();
    expect(after.data.toOrder[0]).toMatchObject({ sku: s, qty: 12, inStock: 2 });
  });

  test("dismissed suggestions stay away; nonsense ids are refused", async () => {
    expect((await call("POST", "/api/v1/suggestions/reorder%3AX'%3BDROP", { decision: "approve" })).status).toBe(400);
    expect((await call("POST", "/api/v1/suggestions/reorder%3AOP-AIRMIX", { decision: "maybe" })).status).toBe(400);
  });
});

describe("insights in Hindi", () => {
  test("the question asks for a Hindi answer when the app is in Hindi", async () => {
    ai = fakeAi("सबसे ज़्यादा OP AirMix बिका।", "anthropic");
    const r = await call("POST", "/api/v1/insights/ask", { question: "kya bika?", lang: "hi" });
    expect(r.status).toBe(200);
    expect(ai.calls.at(-1)!.body.messages[0].content).toContain("Answer in simple Hindi");
  });
});
