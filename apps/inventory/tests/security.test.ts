import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { createApp, type App } from "../src/app";

// Fixes from the security review (2026-11-15): parallel PIN guesses, locked-out owners, sessions that
// outlived a sign-out or a new PIN, formulas in CSV exports, and stock-in topping up the wrong item.
const PUBLIC = join(import.meta.dir, "..", "public");
let app: App;

async function call(method: string, path: string, body?: unknown, cookie = "", ip = "10.0.0.1") {
  const headers: Record<string, string> = { "x-requested-with": "StockRoom", "x-real-ip": ip };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await app.fetch(new Request(`https://stock.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, cookies: res.headers.getSetCookie().map((c) => c.split(";")[0]) };
}

let owner = "";
let ownerId = "";
let staffId = "";

beforeAll(async () => {
  app = createApp({ dbPath: ":memory:", secret: "test-secret-test-secret-test-secret-xx", publicDir: PUBLIC, version: "test", log: () => {}, rateLimits: { login: { max: 1000, windowMs: 60_000 } } });
  const r = await call("POST", "/api/v1/auth/setup", { name: "Papa", pin: "246813" });
  owner = r.cookies[0];
  ownerId = r.data.me.userId;
  staffId = (await call("POST", "/api/v1/admin/users", { name: "Raju", pin: "1357", role: "staff" }, owner)).data.user.id;
});

describe("PINs", () => {
  test("the owner's PIN needs 6 digits; staff may use 4", async () => {
    expect((await call("POST", "/api/v1/admin/users", { name: "Boss", pin: "1234", role: "admin" }, owner)).status).toBe(400);
    expect((await call("POST", "/api/v1/admin/users", { name: "Boss", pin: "123456", role: "admin" }, owner)).status).toBe(201);
  });

  test("twenty wrong PINs sent at once still lock the account", async () => {
    const guesses = Array.from({ length: 20 }, (_, i) => call("POST", "/api/v1/auth/login", { userId: staffId, pin: String(2000 + i) }, "", `10.1.0.${i}`));
    const codes = (await Promise.all(guesses)).map((r) => r.status);
    expect(codes).toContain(423);
    // The right PIN from a stranger's device is refused while locked.
    expect((await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "1357" }, "", "10.2.0.1")).status).toBe(423);
  });

  test("a phone that signed in before is not locked out by strangers' guesses", async () => {
    await call("PATCH", `/api/v1/admin/users/${staffId}`, { pin: "1357" }, owner); // clears the lock
    const first = await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "1357" });
    const device = first.cookies.find((c) => c.startsWith("sr_dev_"))!;
    expect(device).toBeTruthy();
    for (let i = 0; i < 6; i++) await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "0000" }, "", `10.3.0.${i}`);
    expect((await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "1357" }, "", "10.4.0.1")).status).toBe(423);
    expect((await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "1357" }, device)).status).toBe(200);
  });
});

describe("sessions end when they should", () => {
  test("a new PIN signs the old phone out", async () => {
    const s = (await call("POST", "/api/v1/auth/login", { userId: ownerId, pin: "246813" })).cookies[0];
    expect((await call("GET", "/api/v1/bootstrap", undefined, s)).status).toBe(200);
    await call("PATCH", `/api/v1/admin/users/${staffId}`, { pin: "2468" }, owner);
    const staff = (await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "2468" })).cookies[0];
    expect((await call("GET", "/api/v1/bootstrap", undefined, staff)).status).toBe(200);
    await call("PATCH", `/api/v1/admin/users/${staffId}`, { pin: "8642" }, owner);
    expect((await call("GET", "/api/v1/bootstrap", undefined, staff)).status).toBe(401);
  });

  test("signing out ends the session, even if the cookie is kept", async () => {
    const s = (await call("POST", "/api/v1/auth/login", { userId: staffId, pin: "8642" })).cookies[0];
    await call("POST", "/api/v1/auth/logout", undefined, s);
    expect((await call("GET", "/api/v1/bootstrap", undefined, s)).status).toBe(401);
  });
});

describe("stock", () => {
  test("text from a bill that looks like a formula comes out of the CSV as plain text", async () => {
    owner = (await call("POST", "/api/v1/auth/login", { userId: ownerId, pin: "246813" })).cookies[0];
    await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 2, brand: '=HYPERLINK("http://x")', article: "Trap", colour: "Black" }] }, owner);
    const csv = (await call("GET", "/api/v1/export/items.csv", undefined, owner)).data as string;
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  test("a delivery for a picked item tops up exactly that item", async () => {
    const made = await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 5, brand: "Bata", article: "Picked", colour: "Tan" }] }, owner);
    const sku = made.data.items[0].sku;
    const r = await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 3, sku }] }, owner);
    expect(r.data.results[0]).toMatchObject({ sku, before: 5, after: 8 });
  });

  test("a delivery whose pairs were partly sold cannot be undone halfway", async () => {
    const r = await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 10, brand: "Bata", article: "Half", colour: "Black" }] }, owner);
    const sku = r.data.items[0].sku;
    await call("POST", "/api/v1/bills/apply", { kind: "out", lines: [{ qty: 6, sku }] }, owner);
    const u = await call("POST", `/api/v1/bills/${r.data.bill.id}/undo`, undefined, owner);
    expect(u.status).toBe(409);
    expect(u.data.error).toContain("6 of the 10 pairs");
  });

  test("a sale counts the pairs that really left, and a repeated Approve still shows the shortfall", async () => {
    const r = await call("POST", "/api/v1/bills/apply", { kind: "in", lines: [{ qty: 2, brand: "Bata", article: "Short", colour: "Black" }] }, owner);
    const sku = r.data.items[0].sku;
    const id = crypto.randomUUID();
    const sale = await call("POST", "/api/v1/bills/apply", { id, kind: "out", lines: [{ qty: 5, sku }] }, owner);
    expect(sale.data.bill.units).toBe(2);
    const again = await call("POST", "/api/v1/bills/apply", { id, kind: "out", lines: [{ qty: 5, sku }] }, owner);
    expect(again.data.results[0].short).toBe(3);
  });
});
