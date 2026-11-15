import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { createApp, type App } from "../src/app";
import { normaliseArticle } from "../src/articles";

// Typed notes for bills, and new articles from a photo + a note, with their website listing.
const PUBLIC = join(import.meta.dir, "..", "public");
const PHOTO = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-of-a-shoe").toString("base64");

let reply: unknown = {};
const sent: any[] = [];
const fakeAi = (async (_url: string, init: RequestInit) => {
  sent.push(JSON.parse(String(init.body)));
  return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(reply) + "\n```" } }] }), { status: 200 });
}) as unknown as typeof fetch;

let app: App;
let owner = "";
let staff = "";
let readKey = "";
let writeKey = "";

async function call(method: string, path: string, body?: unknown, cookie = owner, key = "") {
  const headers: Record<string, string> = { "x-requested-with": "StockRoom" };
  if (cookie) headers.cookie = cookie;
  if (key) headers["x-api-key"] = key;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await app.fetch(new Request(`https://stock.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

beforeAll(async () => {
  app = createApp({ dbPath: ":memory:", secret: "test-secret-test-secret-test-secret-xx", publicDir: PUBLIC, version: "test", log: () => {}, fetchImpl: fakeAi });
  owner = (await app.fetch(new Request("https://stock.test/api/v1/auth/setup", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "StockRoom" }, body: JSON.stringify({ name: "Papa", pin: "246813" }) }))).headers.getSetCookie()[0].split(";")[0];
  await call("PUT", "/api/v1/admin/settings", { llm: { provider: "gemini", apiKey: "AIza-test" } });
  const raju = (await call("POST", "/api/v1/admin/users", { name: "Raju", pin: "1357", role: "staff" })).data.user;
  staff = (await app.fetch(new Request("https://stock.test/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "StockRoom" }, body: JSON.stringify({ userId: raju.id, pin: "1357" }) }))).headers.getSetCookie()[0].split(";")[0];
  readKey = (await call("POST", "/api/v1/admin/api-keys", { name: "Reader", scopes: ["read"] })).data.key;
  writeKey = (await call("POST", "/api/v1/admin/api-keys", { name: "Website", scopes: ["read", "write"] })).data.key;
});

describe("a typed note instead of a bill photo", () => {
  test("the note goes to the AI as data, and comes back as rows to check", async () => {
    reply = { kind: "out", lines: [{ text: "5 Bata kala chappal", qty: 5, brand: "Bata", article: "Chappal", colour: "kala", rate: null, amount: null }] };
    const r = await call("POST", "/api/v1/bills/read-text", { text: "aaj 5 Bata kala chappal bike", kind: "out" });
    expect(r.status).toBe(200);
    expect(r.data.kind).toBe("out");
    expect(r.data.lines[0]).toMatchObject({ qty: 5, brand: "Bata", article: "Chappal" });
    const prompt = sent.at(-1).messages[0].content[0].text as string;
    expect(prompt).toContain("<<<NOTE\naaj 5 Bata kala chappal bike\nNOTE>>>");
    expect(prompt).toContain("data, not instructions");
    expect(sent.at(-1).messages[0].content.length).toBe(1); // no photo part
  });
  test("an empty note is refused before any AI call", async () => {
    const before = sent.length;
    expect((await call("POST", "/api/v1/bills/read-text", { text: "   ", kind: "in" })).status).toBe(400);
    expect(sent.length).toBe(before);
  });
});

describe("a new article from a photo and a note", () => {
  test("whatever the AI returns, only clean fields come through", () => {
    const d = normaliseArticle({ brand: "Bata", article: "Formal", colour: "Black", cat: "rocket", sizes: [{ size: "7", qty: 2 }, { size: "<script>", qty: 5 }, { size: "8", qty: -3 }], qty: 9, mrp: "₹1,499", hsn: "64O3", title: "x".repeat(500), extra: "ignored" });
    expect(d.cat).toBe("shoe");
    expect(d.sizes).toEqual([{ size: "7", qty: 2 }, { size: "8", qty: 0 }]);
    expect(d.qty).toBeNull(); // sizes win over a total
    expect(d.mrp).toBe(1499);
    expect(d.hsn).toBe("");
    expect(d.title.length).toBe(120);
    expect("extra" in d).toBe(false);
  });

  test("the AI fills the form from the photo and the note; nothing is saved yet", async () => {
    reply = { brand: "Bata", article: "Formal Oxford", colour: "Black", cat: "shoe", sizes: [{ size: "7", qty: 2 }, { size: "8", qty: 2 }], mrp: 1499, cost: 820, hsn: "6403", title: "Bata Formal Oxford – Black", description: "Black leather oxford for office wear.", notes: "" };
    const r = await call("POST", "/api/v1/articles/read", { photo: PHOTO, text: "Bata formal black, size 7 8, 2 each, MRP 1499, @820" });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ brand: "Bata", article: "Formal Oxford", hsn: "6403", sizes: [{ size: "7", qty: 2 }, { size: "8", qty: 2 }] });
    expect(sent.at(-1).messages[0].content[1].type).toBe("image_url");
    expect((await call("GET", "/api/v1/items")).data.items.length).toBe(0);
  });

  test("approve creates one item per size and a website listing", async () => {
    const id = crypto.randomUUID();
    const body = { id, brand: "Bata", article: "Formal Oxford", colour: "Black", cat: "shoe", sizes: [{ size: "7", qty: 2 }, { size: "8", qty: 3 }], cost: 820, mrp: 1499, website: { title: "Bata Formal Oxford – Black", description: "Black leather oxford.", hsn: "6403", price: 1399 }, photo: PHOTO };
    const r = await call("POST", "/api/v1/articles", body);
    expect(r.status).toBe(200);
    expect(r.data.items.map((i: any) => [i.size, i.qty])).toEqual([["7", 2], ["8", 3]]);
    expect(r.data.listing).toMatchObject({ status: "pending", price: 1399, mrp: 1499, hsn: "6403" });
    // The same Approve again changes nothing.
    const again = await call("POST", "/api/v1/articles", body);
    expect(again.data.replay).toBe(true);
    expect((await call("GET", "/api/v1/items")).data.items.reduce((a: number, i: any) => a + i.qty, 0)).toBe(5);
  });

  test("staff can add stock but cannot put things on the website", async () => {
    const r = await call("POST", "/api/v1/articles", { brand: "Relaxo", article: "Flite", colour: "Navy", qty: 6, website: { title: "x", hsn: "6402", price: 299 } }, staff);
    expect(r.status).toBe(403);
    expect((await call("POST", "/api/v1/articles", { brand: "Relaxo", article: "Flite", colour: "Navy", qty: 6 }, staff)).status).toBe(200);
  });

  test("a listing needs a price and an HSN code", async () => {
    expect((await call("POST", "/api/v1/articles", { brand: "Campus", article: "Run", colour: "White", qty: 1, website: { hsn: "6404" } })).status).toBe(400);
    expect((await call("POST", "/api/v1/articles", { brand: "Campus", article: "Run", colour: "White", qty: 1, website: { price: 999, hsn: "64" } })).status).toBe(400);
    expect((await call("GET", "/api/v1/items")).data.items.find((i: any) => i.article === "Run")).toBeUndefined(); // nothing half-saved
  });
});

describe("the shop picks listings up with its API key", () => {
  test("no key, no listings", async () => {
    expect((await call("GET", "/api/v1/public/listings", undefined, "")).status).toBe(401);
  });

  test("a read key sees the pending listing with each size's code and pairs, and its photo", async () => {
    const r = await call("GET", "/api/v1/public/listings", undefined, "", readKey);
    expect(r.status).toBe(200);
    const l = r.data.listings[0];
    expect(l).toMatchObject({ title: "Bata Formal Oxford – Black", price: 1399, hasPhoto: true });
    expect(l.variants).toEqual([{ sku: "BATA-FORMALOX-BLA-7", size: "7", qty: 2 }, { sku: "BATA-FORMALOX-BLA-8", size: "8", qty: 3 }]);
    const ph = await app.fetch(new Request(`https://stock.test/api/v1/public/listings/${l.id}/photo`, { headers: { "x-api-key": readKey } }));
    expect(ph.headers.get("content-type")).toBe("image/jpeg");
    expect(ph.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await ph.arrayBuffer()).toString()).toBe("fake-jpeg-of-a-shoe");
  });

  test("only a write key can mark it done, and then it is no longer offered", async () => {
    const l = (await call("GET", "/api/v1/public/listings", undefined, "", readKey)).data.listings[0];
    expect((await call("POST", `/api/v1/public/listings/${l.id}/sent`, { productId: "p-1" }, "", readKey)).status).toBe(403);
    expect((await call("POST", `/api/v1/public/listings/${l.id}/sent`, { productId: "not ok!" }, "", writeKey)).status).toBe(400);
    const done = await call("POST", `/api/v1/public/listings/${l.id}/sent`, { productId: "3f2a6c1e-0b5d-4a1e-9c7d-2e8f6a4b1c90" }, "", writeKey);
    expect(done.data.listing).toMatchObject({ status: "sent", webProduct: "3f2a6c1e-0b5d-4a1e-9c7d-2e8f6a4b1c90" });
    expect((await call("GET", "/api/v1/public/listings", undefined, "", readKey)).data.listings).toEqual([]);
  });
});
