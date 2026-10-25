import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { createApp, type App } from "../src/app";
import { readXlsx } from "../src/xlsx";
import { parseTable } from "../src/stock";

const PUBLIC = join(import.meta.dir, "..", "public");
let app: App;
let cookie = "";
let staffCookie = "";
let apiKey = "";

async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, useCookie = cookie) {
  const headers: Record<string, string> = { "x-requested-with": "StockRoom", ...extra };
  if (useCookie) headers.cookie = useCookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await app.fetch(new Request(`https://stock.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

beforeAll(() => {
  app = createApp({ dbPath: ":memory:", secret: "test-secret-test-secret-test-secret-xx", publicDir: PUBLIC, version: "test", log: () => {} });
});

describe("setup and login", () => {
  test("fresh install needs setup", async () => {
    const r = await call("GET", "/api/v1/auth/state", undefined, {}, "");
    expect(r.status).toBe(200);
    expect(r.data.setupNeeded).toBe(true);
  });
  test("rejects bad PIN format", async () => {
    const r = await call("POST", "/api/v1/auth/setup", { name: "Papa", pin: "12" }, {}, "");
    expect(r.status).toBe(400);
  });
  test("creates owner and signs in", async () => {
    const r = await call("POST", "/api/v1/auth/setup", { name: "Papa", pin: "2468", shop: "Ideal Shoes", appUrl: "https://stock.test" }, {}, "");
    expect(r.status).toBe(200);
    expect(r.data.me.role).toBe("admin");
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toContain("HttpOnly");
    cookie = sc.split(";")[0];
  });
  test("second setup is refused", async () => {
    const r = await call("POST", "/api/v1/auth/setup", { name: "X", pin: "1111" }, {}, "");
    expect(r.status).toBe(409);
  });
  test("wrong PIN fails, five wrong PINs lock", async () => {
    const state = await call("GET", "/api/v1/auth/state", undefined, {}, "");
    const id = state.data.users[0].id;
    for (let i = 0; i < 4; i++) expect((await call("POST", "/api/v1/auth/login", { userId: id, pin: "0000" }, {}, "")).status).toBe(401);
    expect((await call("POST", "/api/v1/auth/login", { userId: id, pin: "0000" }, {}, "")).status).toBe(423);
    expect((await call("POST", "/api/v1/auth/login", { userId: id, pin: "2468" }, {}, "")).status).toBe(423);
  });
  test("mutations without the CSRF header are refused", async () => {
    const res = await app.fetch(new Request("https://stock.test/api/v1/items", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(403);
  });
});

describe("stock", () => {
  test("add an article with a size run", async () => {
    const rows = ["7", "8", "9", "10"].map((size, i) => ({ brand: "IDEALX", article: "DMS Boot", colour: "Black", size, cat: "boot", cost: 900, mrp: 2499, loc: "Godown A", qty: i + 1 }));
    const r = await call("POST", "/api/v1/items", { rows });
    expect(r.status).toBe(200);
    expect(r.data.results).toHaveLength(4);
    expect(r.data.results[0].item.sku).toBe("IDEA-DMSBOOT-BLA-7");
    expect(r.data.results[3].item.qty).toBe(4);
  });
  test("adding the same SKU again tops up instead of duplicating", async () => {
    const r = await call("POST", "/api/v1/items", { rows: [{ brand: "IDEALX", article: "DMS Boot", colour: "Black", size: "9", cat: "boot", qty: 5 }] });
    expect(r.data.results[0].item.qty).toBe(8);
    expect(r.data.results[0].movement.type).toBe("in");
  });
  test("sold decrements, idempotent on id", async () => {
    const id = crypto.randomUUID();
    const a = await call("POST", "/api/v1/movements", { id, sku: "IDEA-DMSBOOT-BLA-9", type: "out", delta: -1, note: "Sold" });
    expect(a.status).toBe(200);
    expect(a.data.item.qty).toBe(7);
    const b = await call("POST", "/api/v1/movements", { id, sku: "IDEA-DMSBOOT-BLA-9", type: "out", delta: -1 });
    expect(b.data.item.qty).toBe(7);
    expect(b.data.idempotent).toBe(true);
  });
  test("selling below zero clamps at zero and records what happened", async () => {
    const r = await call("POST", "/api/v1/movements", { sku: "IDEA-DMSBOOT-BLA-7", type: "out", delta: -5 });
    expect(r.data.item.qty).toBe(0);
    expect(r.data.movement.delta).toBe(-1);
  });
  test("count sets the quantity", async () => {
    const r = await call("POST", "/api/v1/movements", { sku: "IDEA-DMSBOOT-BLA-8", type: "count", counted: 11 });
    expect(r.data.item.qty).toBe(11);
    expect(r.data.movement.delta).toBe(9);
    expect(r.data.item.lastCount).toBeTruthy();
  });
  test("scanned text with the app URL resolves to the SKU", async () => {
    const r = await call("GET", "/api/v1/items/" + encodeURIComponent("https://stock.test/#IDEA-DMSBOOT-BLA-8"));
    expect(r.status).toBe(200);
    expect(r.data.item.sku).toBe("IDEA-DMSBOOT-BLA-8");
  });
  test("unknown SKU is a 404 with a readable message", async () => {
    const r = await call("POST", "/api/v1/movements", { sku: "NOPE-1", type: "out", delta: -1 });
    expect(r.status).toBe(404);
    expect(r.data.error).toContain("NOPE-1");
  });
});

describe("roles", () => {
  test("admin creates a staff user who can sell but not edit prices", async () => {
    const r = await call("POST", "/api/v1/admin/users", { name: "Raju", pin: "1234", role: "staff" });
    expect(r.status).toBe(201);
    const login = await call("POST", "/api/v1/auth/login", { userId: r.data.user.id, pin: "1234" }, {}, "");
    expect(login.status).toBe(200);
    staffCookie = login.headers.get("set-cookie")!.split(";")[0];
    const sell = await call("POST", "/api/v1/movements", { sku: "IDEA-DMSBOOT-BLA-8", type: "out", delta: -1 }, {}, staffCookie);
    expect(sell.status).toBe(200);
    const edit = await call("PATCH", "/api/v1/items/IDEA-DMSBOOT-BLA-8", { cost: 950 }, {}, staffCookie);
    expect(edit.status).toBe(403);
    const admin = await call("GET", "/api/v1/admin/users", undefined, {}, staffCookie);
    expect(admin.status).toBe(403);
  });
  test("deactivated user loses access immediately", async () => {
    const users = await call("GET", "/api/v1/admin/users");
    const raju = users.data.users.find((u: any) => u.name === "Raju");
    await call("PATCH", `/api/v1/admin/users/${raju.id}`, { active: false });
    const r = await call("GET", "/api/v1/bootstrap", undefined, {}, staffCookie);
    expect(r.status).toBe(401);
  });
});

describe("reports", () => {
  test("dashboard aggregates are consistent", async () => {
    const r = await call("GET", "/api/v1/reports/dashboard?days=30");
    expect(r.status).toBe(200);
    const items = (await call("GET", "/api/v1/items")).data.items;
    const units = items.reduce((a: number, i: any) => a + i.qty, 0);
    expect(r.data.summary.units).toBe(units);
    expect(r.data.trend).toHaveLength(30);
    expect(r.data.trend.at(-1).sold).toBeGreaterThan(0);
    expect(r.data.ageing.reduce((a: number, b: any) => a + b.units, 0)).toBe(units);
  });
  test("size gaps flag the zero-stock size of a selling article", async () => {
    const r = await call("GET", "/api/v1/reports/dashboard");
    const gap = r.data.sizeGaps.find((g: any) => g.article === "DMS Boot");
    expect(gap).toBeTruthy();
    expect(gap.missing).toContain("7");
  });
  test("CSV export has one row per item", async () => {
    const r = await call("GET", "/api/v1/export/items.csv");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(String(r.data).trim().split("\n").length).toBe(5);
  });
});

describe("public API with keys", () => {
  test("no key, no access", async () => {
    const r = await call("GET", "/api/v1/public/stock", undefined, {}, "");
    expect(r.status).toBe(401);
  });
  test("read key reads but cannot write", async () => {
    const k = await call("POST", "/api/v1/admin/api-keys", { name: "LLM agent", scopes: ["read"] });
    expect(k.status).toBe(201);
    expect(k.data.key).toMatch(/^idx_[0-9a-f]{12}_/);
    const r = await call("GET", "/api/v1/public/stock", undefined, { "x-api-key": k.data.key }, "");
    expect(r.status).toBe(200);
    expect(r.data.items.length).toBe(4);
    const w = await call("POST", "/api/v1/public/movements", { sku: "IDEA-DMSBOOT-BLA-10", type: "out", delta: -1 }, { "x-api-key": k.data.key }, "");
    expect(w.status).toBe(403);
    const s = await call("GET", "/api/v1/public/summary", undefined, { "x-api-key": k.data.key }, "");
    expect(s.data.summary.skus).toBe(4);
  });
  test("write key records a web order idempotently; revoked key stops working", async () => {
    const k = await call("POST", "/api/v1/admin/api-keys", { name: "Website", scopes: ["read", "write"] });
    apiKey = k.data.key;
    const id = crypto.randomUUID();
    const a = await call("POST", "/api/v1/public/movements", { id, sku: "IDEA-DMSBOOT-BLA-10", type: "out", delta: -2, note: "Web order IDX-26-ABC", ref: "order-1" }, { "x-api-key": apiKey }, "");
    expect(a.status).toBe(200);
    expect(a.data.item.qty).toBe(2);
    const b = await call("POST", "/api/v1/public/movements", { id, sku: "IDEA-DMSBOOT-BLA-10", type: "out", delta: -2 }, { "x-api-key": apiKey }, "");
    expect(b.data.item.qty).toBe(2);
    expect(b.data.idempotent).toBe(true);
    await call("DELETE", `/api/v1/admin/api-keys/${k.data.record.id}`);
    const c = await call("GET", "/api/v1/public/stock", undefined, { "x-api-key": apiKey }, "");
    expect(c.status).toBe(401);
  });
  test("openapi spec is served without a key", async () => {
    const r = await call("GET", "/api/v1/public/openapi.json", undefined, {}, "");
    expect(r.status).toBe(200);
    expect(r.data.paths["/movements"]).toBeTruthy();
  });
});

describe("admin extras", () => {
  test("CSV import tops up and creates", async () => {
    const csvText = 'brand,article,colour,size,cat,cost,mrp,qty,loc\nIDEALX,DMS Boot,Black,9,boot,900,2499,2,Godown A\nMr Brown,Chelsea,Tan,8,boot,700,1999,3,Rack 2\n';
    const res = await app.fetch(new Request("https://stock.test/api/v1/admin/import/csv", { method: "POST", headers: { cookie, "x-requested-with": "StockRoom", "content-type": "text/csv" }, body: csvText }));
    const data: any = await res.json();
    expect(res.status).toBe(200);
    expect(data.added).toBe(1);
    expect(data.merged).toBe(1);
  });
  test("Excel import tops up and creates; a bad file is refused", async () => {
    const file = await Bun.file(join(import.meta.dir, "fixtures", "register-openpyxl.xlsx")).arrayBuffer();
    const post = (b: BodyInit) => app.fetch(new Request("https://stock.test/api/v1/admin/import/xlsx", { method: "POST", headers: { cookie, "x-requested-with": "StockRoom", "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: b }));
    const res = await post(file);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: 3, added: 3, merged: 0 });
    const again: any = await (await post(file)).json();
    expect(again.merged).toBe(3);
    const item = await call("GET", "/api/v1/items/IDEA-OXFORD-BLA-8");
    expect(item.data.item.qty).toBe(8);
    const bad = await post("not a workbook");
    expect(bad.status).toBe(400);
  });
  test("Excel export has stock, by-article and movements sheets", async () => {
    const res = await app.fetch(new Request("https://stock.test/api/v1/export/stock.xlsx", { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/stock-\d{4}-\d{2}-\d{2}\.xlsx/);
    const buf = new Uint8Array(await res.arrayBuffer());
    const rows = readXlsx(buf);
    const items = (await call("GET", "/api/v1/items")).data.items;
    expect(rows.length).toBe(items.length + 1);
    expect(rows[0].slice(0, 9)).toEqual(["sku", "brand", "article", "colour", "size", "cat", "cost", "mrp", "qty"]);
    const xml = new TextDecoder().decode(buf);
    expect(parseTable(rows).length).toBe(items.length);
    expect(xml).toContain("worksheets/sheet3.xml");
    const tpl = await app.fetch(new Request("https://stock.test/api/v1/export/template.xlsx", { headers: { cookie } }));
    expect(parseTable(readXlsx(new Uint8Array(await tpl.arrayBuffer())))).toHaveLength(1);
  });
  test("settings round-trip; LLM key is never returned", async () => {
    const r = await call("PUT", "/api/v1/admin/settings", { shop: "Ideal Shoes Agra", llm: { provider: "anthropic", apiKey: "sk-ant-test", model: "claude-sonnet-4-5" } });
    expect(r.status).toBe(200);
    expect(r.data.settings.shop).toBe("Ideal Shoes Agra");
    expect(r.data.settings.llm.hasKey).toBe(true);
    expect(JSON.stringify(r.data)).not.toContain("sk-ant-test");
  });
  test("audit log records what happened", async () => {
    const r = await call("GET", "/api/v1/admin/audit?limit=500");
    const actions = r.data.audit.map((a: any) => a.action);
    for (const a of ["setup", "login_failed", "add_stock", "add_user", "create_api_key", "revoke_api_key", "import_csv", "edit_settings"]) expect(actions).toContain(a);
  });
  test("health and metrics", async () => {
    const h = await call("GET", "/healthz", undefined, {}, "");
    expect(h.data.ok).toBe(true);
    const m = await call("GET", "/metrics", undefined, {}, "");
    expect(String(m.data)).toContain("stockroom_http_requests_total");
    expect(String(m.data)).toContain("stockroom_units");
  });
  test("static files are served with security headers; traversal is blocked", async () => {
    const r = await app.fetch(new Request("https://stock.test/"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    const t = await app.fetch(new Request("https://stock.test/../package.json"));
    expect(t.status).toBe(404);
  });
});

describe("rate limits", () => {
  // A separate app with small limits so the shared suite above is not affected.
  const limited = () => createApp({ dbPath: ":memory:", secret: "test-secret-test-secret-test-secret-xx", publicDir: PUBLIC, version: "test", log: () => {}, rateLimits: { login: { max: 3, windowMs: 60_000 }, publicApi: { max: 5, windowMs: 60_000 } } });
  const req = (a: App, method: string, path: string, ip: string, body?: unknown) =>
    a.fetch(new Request(`https://stock.test${path}`, { method, headers: { "x-real-ip": ip, "content-type": "application/json", "x-requested-with": "StockRoom" }, body: body === undefined ? undefined : JSON.stringify(body) }));

  test("login attempts are limited per IP, with Retry-After", async () => {
    const a = limited();
    for (let i = 0; i < 3; i++) expect((await req(a, "POST", "/api/v1/auth/login", "10.0.0.1", { userId: "x", pin: "0000" })).status).toBe(401);
    const blocked = await req(a, "POST", "/api/v1/auth/login", "10.0.0.1", { userId: "x", pin: "0000" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // another phone on another address is unaffected
    expect((await req(a, "POST", "/api/v1/auth/login", "10.0.0.2", { userId: "x", pin: "0000" })).status).toBe(401);
  });
  test("public API is limited per IP; a spoofed X-Forwarded-For does not reset it", async () => {
    const a = limited();
    for (let i = 0; i < 5; i++) expect((await req(a, "GET", "/api/v1/public/stock", "10.0.0.3")).status).toBe(401);
    expect((await req(a, "GET", "/api/v1/public/stock", "10.0.0.3")).status).toBe(429);
    const spoof = await a.fetch(new Request("https://stock.test/api/v1/public/stock", { headers: { "x-real-ip": "10.0.0.3", "x-forwarded-for": "1.2.3.4" } }));
    expect(spoof.status).toBe(429);
    expect((await req(a, "GET", "/api/v1/public/stock", "10.0.0.4")).status).toBe(401);
  });
  test("signed-in app traffic is not counted against the public limit", async () => {
    const a = limited();
    for (let i = 0; i < 10; i++) expect((await req(a, "GET", "/api/v1/auth/state", "10.0.0.5")).status).toBe(200);
  });
});

describe("backups", () => {
  test("on-demand backup goes to the backup folder and is a real database", async () => {
    const { mkdtempSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { Database } = await import("bun:sqlite");
    const dir = mkdtempSync(join(tmpdir(), "stockroom-backup-"));
    const a = createApp({ dbPath: ":memory:", secret: "test-secret-test-secret-test-secret-xx", publicDir: PUBLIC, backupDir: dir, version: "test", log: () => {} });
    const h = { "x-requested-with": "StockRoom", "content-type": "application/json" };
    const setup = await a.fetch(new Request("https://stock.test/api/v1/auth/setup", { method: "POST", headers: h, body: JSON.stringify({ name: "Papa", pin: "2468" }) }));
    const c = setup.headers.get("set-cookie")!.split(";")[0];
    await a.fetch(new Request("https://stock.test/api/v1/items", { method: "POST", headers: { ...h, cookie: c }, body: JSON.stringify({ rows: [{ brand: "IDEALX", article: "Oxford", colour: "Black", size: "8", cat: "shoe", qty: 4 }] }) }));
    const r = await a.fetch(new Request("https://stock.test/api/v1/admin/backup", { headers: { cookie: c } }));
    expect(r.status).toBe(200);
    const files = readdirSync(dir).filter((f) => f.endsWith(".db"));
    expect(files).toHaveLength(1);
    const restored = new Database(join(dir, files[0]), { readonly: true });
    expect(restored.query<{ n: number }, []>("SELECT SUM(qty) AS n FROM items").get()!.n).toBe(4);
  });
});
