import type { Database } from "bun:sqlite";
import { join, normalize, extname } from "node:path";
import {
  openDb,
  now,
  getSetting,
  setSetting,
  audit,
  allItems,
  getItem,
  recentMovements,
  movementsSince,
  type UserRow,
  type ItemRow,
  type MovementRow,
} from "./db";
import {
  attemptLogin,
  hashPin,
  validPin,
  issueSession,
  clearSessionCookie,
  sessionFromRequest,
  apiKeyFromRequest,
  generateApiKey,
  type Session,
  type Scope,
  type ApiKeyRow,
} from "./auth";
import { addStock, applyMovement, updateItemDetails, deleteItem, parseCsv, StockError, normalizeSku, CATEGORIES } from "./stock";
import * as R from "./reports";
import { askLlm, getLlmConfig, setLlmConfig } from "./insights";
import * as M from "./metrics";

export interface AppOptions {
  dbPath: string;
  secret: string;
  publicDir: string;
  version?: string;
  metricsToken?: string;
  log?: (line: Record<string, unknown>) => void;
}

export interface App {
  fetch: (req: Request) => Promise<Response>;
  db: Database;
  backup: (dir: string) => Promise<string>;
}

const DEFAULT_SIZE_RUNS: Record<string, string[]> = {
  boot: ["6", "7", "8", "9", "10", "11", "12"],
  shoe: ["6", "7", "8", "9", "10", "11"],
  jacket: ["S", "M", "L", "XL", "XXL"],
  belt: ["32", "34", "36", "38", "40", "42"],
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

const text = (body: string, status = 200, type = "text/plain; charset=utf-8", headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });

async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const t = await req.text();
    if (!t) return {} as T;
    return JSON.parse(t) as T;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

function csv(rows: Record<string, unknown>[], cols: string[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n") + "\n";
}

function publicItem(it: ItemRow) {
  return { sku: it.sku, brand: it.brand, article: it.article, colour: it.colour, size: it.size, cat: it.cat, qty: it.qty, mrp: it.mrp, cost: it.cost, loc: it.loc, updatedAt: it.updated_at, lastIn: it.last_in, lastOut: it.last_out, lastCount: it.last_count, createdAt: it.created_at };
}

function publicMovement(m: MovementRow) {
  return { id: m.id, sku: m.sku, type: m.type, delta: m.delta, before: m.before_qty, after: m.after_qty, note: m.note, by: m.by_user, source: m.source, ref: m.ref, at: m.at };
}

function publicUser(u: UserRow) {
  return { id: u.id, name: u.name, role: u.role, active: Boolean(u.active), createdAt: u.created_at, lockedUntil: u.locked_until };
}

function publicKey(k: ApiKeyRow) {
  return { id: k.id, name: k.name, prefix: k.prefix, scopes: JSON.parse(k.scopes) as Scope[], createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at };
}

function publicSettings(db: Database) {
  return {
    shop: getSetting<string>(db, "shop", "Ideal Shoes"),
    appUrl: getSetting<string>(db, "appUrl", ""),
    sizeRuns: getSetting<Record<string, string[]>>(db, "sizeRuns", DEFAULT_SIZE_RUNS),
    categories: CATEGORIES,
    llm: getLlmConfig(db),
  };
}

export function createApp(opts: AppOptions): App {
  const db = openDb(opts.dbPath);
  const version = opts.version ?? "dev";
  const log = opts.log ?? ((l) => console.log(JSON.stringify(l)));

  const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;

  function requireSession(req: Request): Session {
    const s = sessionFromRequest(db, opts.secret, req);
    if (!s) throw new HttpError(401, "Sign in required");
    if (req.method !== "GET" && req.method !== "HEAD" && req.headers.get("x-requested-with") !== "StockRoom") {
      throw new HttpError(403, "Missing X-Requested-With header");
    }
    return s;
  }
  function requireAdmin(req: Request): Session {
    const s = requireSession(req);
    if (s.role !== "admin") throw new HttpError(403, "Admin only");
    return s;
  }
  function requireApiKey(req: Request, scope: Scope) {
    const k = apiKeyFromRequest(db, req);
    if (!k) throw new HttpError(401, "Valid X-API-Key required");
    if (!k.scopes.includes(scope)) throw new HttpError(403, `API key lacks '${scope}' scope`);
    return k;
  }
  function sizeRun(): string[] {
    const runs = getSetting<Record<string, string[]>>(db, "sizeRuns", DEFAULT_SIZE_RUNS);
    return runs.shoe ?? DEFAULT_SIZE_RUNS.shoe;
  }
  function dashboard(days: number) {
    const items = allItems(db);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const moves = movementsSince(db, since);
    const moves30 = movementsSince(db, new Date(Date.now() - 30 * 86400000).toISOString());
    return {
      asOf: now(),
      days,
      summary: R.summary(items),
      ageing: R.ageing(items),
      byBrand: R.byBrand(items),
      byCategory: R.byCategory(items),
      dead: R.deadStock(items, Date.now(), 25).map((d) => ({ ...publicItem(d), ageDays: d.ageDays, value: d.value })),
      trend: R.trend(moves, days),
      topMovers: R.topMovers(items, moves30),
      sizeGaps: R.sizeGaps(items, moves30, sizeRun()),
    };
  }
  function digest() {
    const items = allItems(db);
    const moves30 = movementsSince(db, new Date(Date.now() - 30 * 86400000).toISOString());
    return R.digest(items, moves30, sizeRun());
  }

  async function backup(dir: string): Promise<string> {
    const file = join(dir, `stockroom-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return file;
  }

  // -------------------------------------------------------------------------
  async function route(req: Request, url: URL): Promise<Response> {
    const p = url.pathname;
    const m = req.method;
    const seg = p.split("/").filter(Boolean); // ["api","v1",...]

    // ---- ops ---------------------------------------------------------------
    if (p === "/healthz") {
      let dbOk = true;
      try {
        db.query("SELECT 1").get();
      } catch {
        dbOk = false;
      }
      return json({ ok: dbOk, version, uptimeSeconds: Math.floor((Date.now() - M.startedAt) / 1000), time: now() }, dbOk ? 200 : 503);
    }
    if (p === "/metrics") {
      if (opts.metricsToken && req.headers.get("authorization") !== `Bearer ${opts.metricsToken}`) throw new HttpError(401, "metrics token required");
      const s = R.summary(allItems(db));
      const moves = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM movements").get()?.n ?? 0;
      return text(M.render({ stockroom_items: s.skus, stockroom_units: s.units, stockroom_value_at_cost_rupees: s.valueAtCost, stockroom_dead_value_rupees: s.deadValue, stockroom_movements_total: moves }), 200, "text/plain; version=0.0.4; charset=utf-8");
    }

    if (seg[0] !== "api" || seg[1] !== "v1") return staticFile(p);
    const r = seg.slice(2); // after /api/v1

    // ---- auth ----------------------------------------------------------------
    if (r[0] === "auth") {
      if (r[1] === "state" && m === "GET") {
        const users = db.query<UserRow, []>("SELECT * FROM users WHERE active = 1 ORDER BY role DESC, name").all();
        const me = sessionFromRequest(db, opts.secret, req);
        return json({ setupNeeded: users.length === 0, users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })), me, shop: getSetting(db, "shop", "Ideal Shoes"), version });
      }
      if (r[1] === "setup" && m === "POST") {
        const count = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()!.n;
        if (count > 0) throw new HttpError(409, "Setup already done");
        const b = await body<{ name?: string; pin?: string; appUrl?: string; shop?: string }>(req);
        const name = String(b.name ?? "").trim().slice(0, 40);
        if (!name) throw new HttpError(400, "Name is required");
        if (!validPin(b.pin)) throw new HttpError(400, "PIN must be 4 to 8 digits");
        const user: UserRow = { id: crypto.randomUUID(), name, pin_hash: await hashPin(b.pin), role: "admin", active: 1, failed_attempts: 0, locked_until: null, created_at: now() };
        db.query("INSERT INTO users (id, name, pin_hash, role, active, created_at) VALUES (?,?,?,?,1,?)").run(user.id, user.name, user.pin_hash, user.role, user.created_at);
        if (b.appUrl) setSetting(db, "appUrl", String(b.appUrl).trim().slice(0, 200));
        if (b.shop) setSetting(db, "shop", String(b.shop).trim().slice(0, 60));
        audit(db, { userId: user.id, actor: user.name, action: "setup", ip: ip(req) });
        const { cookie } = issueSession(opts.secret, user);
        return json({ me: { userId: user.id, name: user.name, role: user.role } }, 200, { "set-cookie": cookie });
      }
      if (r[1] === "login" && m === "POST") {
        const b = await body<{ userId?: string; pin?: string }>(req);
        if (!b.userId || !validPin(b.pin)) throw new HttpError(400, "Pick a name and enter your PIN");
        const res = await attemptLogin(db, String(b.userId), b.pin);
        if (!res.ok) {
          M.inc("stockroom_login_failures_total", { reason: res.reason });
          audit(db, { userId: String(b.userId), actor: "?", action: "login_failed", detail: { reason: res.reason }, ip: ip(req) });
          if (res.reason === "locked") throw new HttpError(423, `Too many wrong PINs. Try again after ${new Date(res.lockedUntil!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.`);
          throw new HttpError(401, "Wrong PIN");
        }
        audit(db, { userId: res.user.id, actor: res.user.name, action: "login", ip: ip(req) });
        const { cookie } = issueSession(opts.secret, res.user);
        return json({ me: { userId: res.user.id, name: res.user.name, role: res.user.role } }, 200, { "set-cookie": cookie });
      }
      if (r[1] === "logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": clearSessionCookie });
      throw new HttpError(404, "Not found");
    }

    // ---- public API (API key) -------------------------------------------------
    if (r[0] === "public") {
      if (r[1] === "openapi.json" && m === "GET") return json(openApiSpec(url.origin));
      if (r[1] === "stock" && m === "GET") {
        requireApiKey(req, "read");
        return json({ asOf: now(), items: allItems(db).map(publicItem) });
      }
      if (r[1] === "items" && r[2] && m === "GET") {
        requireApiKey(req, "read");
        const it = getItem(db, normalizeSku(decodeURIComponent(r[2])));
        if (!it) throw new HttpError(404, "Item not found");
        return json({ item: publicItem(it), movements: recentMovements(db, 50, it.sku).map(publicMovement) });
      }
      if (r[1] === "summary" && m === "GET") {
        requireApiKey(req, "read");
        return json(digest());
      }
      if (r[1] === "movements" && m === "POST") {
        const k = requireApiKey(req, "write");
        const b = await body<{ id?: string; sku?: string; type?: string; delta?: number; counted?: number; note?: string; ref?: string }>(req);
        if (!b.sku || !b.type) throw new HttpError(400, "sku and type are required");
        const res = applyMovement(db, { id: b.id, sku: b.sku, type: b.type as "in" | "out" | "count" | "adj", delta: b.delta, counted: b.counted, note: b.note ?? `via API key ${k.name}`, ref: b.ref ?? null }, { userId: null, source: "api" });
        if (!res.idempotent) audit(db, { actor: `api:${k.name}`, action: "movement", target: res.item.sku, detail: { type: res.movement.type, delta: res.movement.delta, ref: res.movement.ref }, ip: ip(req) });
        return json({ item: publicItem(res.item), movement: publicMovement(res.movement), idempotent: Boolean(res.idempotent) });
      }
      throw new HttpError(404, "Not found");
    }

    // ---- everything below needs a signed-in user -------------------------------
    const session = requireSession(req);

    if (r[0] === "bootstrap" && m === "GET") {
      return json({ me: session, settings: publicSettings(db), items: allItems(db).map(publicItem), movements: recentMovements(db, 300).map(publicMovement), serverTime: now(), version });
    }

    if (r[0] === "items") {
      if (!r[1] && m === "GET") return json({ items: allItems(db).map(publicItem) });
      if (!r[1] && m === "POST") {
        const b = await body<{ rows?: unknown[] }>(req);
        const results = addStock(db, (b.rows ?? []) as Parameters<typeof addStock>[1], { userId: session.userId, source: "app" });
        audit(db, { userId: session.userId, actor: session.name, action: "add_stock", detail: { rows: results.length, units: results.reduce((a, x) => a + x.movement.delta, 0) }, ip: ip(req) });
        return json({ results: results.map((x) => ({ item: publicItem(x.item), movement: publicMovement(x.movement) })) });
      }
      const sku = normalizeSku(decodeURIComponent(r[1] ?? ""));
      if (m === "GET") {
        const it = getItem(db, sku);
        if (!it) throw new HttpError(404, "Item not found");
        return json({ item: publicItem(it), movements: recentMovements(db, 50, sku).map(publicMovement) });
      }
      if (m === "PATCH") {
        requireAdmin(req);
        const b = await body<{ cost?: number; mrp?: number; loc?: string; cat?: string }>(req);
        const it = updateItemDetails(db, sku, b);
        audit(db, { userId: session.userId, actor: session.name, action: "edit_item", target: sku, detail: b, ip: ip(req) });
        return json({ item: publicItem(it) });
      }
      if (m === "DELETE") {
        requireAdmin(req);
        deleteItem(db, sku, { userId: session.userId, source: "app" });
        audit(db, { userId: session.userId, actor: session.name, action: "delete_item", target: sku, ip: ip(req) });
        return json({ ok: true });
      }
    }

    if (r[0] === "movements") {
      if (m === "POST") {
        const b = await body<{ id?: string; sku?: string; type?: string; delta?: number; counted?: number; note?: string }>(req);
        if (!b.sku || !b.type) throw new HttpError(400, "sku and type are required");
        const res = applyMovement(db, { id: b.id, sku: b.sku, type: b.type as "in" | "out" | "count" | "adj", delta: b.delta, counted: b.counted, note: b.note }, { userId: session.userId, source: "app" });
        return json({ item: publicItem(res.item), movement: publicMovement(res.movement), idempotent: Boolean(res.idempotent) });
      }
      if (m === "GET") {
        const sku = url.searchParams.get("sku");
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 300) | 0));
        return json({ movements: recentMovements(db, limit, sku ? normalizeSku(sku) : undefined).map(publicMovement) });
      }
    }

    if (r[0] === "reports") {
      if (r[1] === "dashboard" && m === "GET") {
        const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days") ?? 30) | 0));
        return json(dashboard(days));
      }
      if (r[1] === "digest" && m === "GET") return json(digest());
    }

    if (r[0] === "insights") {
      if (m === "GET") {
        const rows = db.query<{ id: string; at: string; user_id: string | null; question: string; answer: string; model: string }, []>("SELECT * FROM insights ORDER BY at DESC LIMIT 50").all();
        return json({ insights: rows, llm: getLlmConfig(db) });
      }
      if (r[1] === "ask" && m === "POST") {
        const b = await body<{ question?: string }>(req);
        const q = String(b.question ?? "").trim().slice(0, 1000);
        if (!q) throw new HttpError(400, "Ask a question");
        try {
          const { answer, model } = await askLlm(db, opts.secret, q, digest());
          const id = crypto.randomUUID();
          db.query("INSERT INTO insights (id, at, user_id, question, answer, model) VALUES (?,?,?,?,?,?)").run(id, now(), session.userId, q, answer, model);
          M.inc("stockroom_llm_calls_total", { status: "ok" });
          return json({ id, question: q, answer, model });
        } catch (e) {
          M.inc("stockroom_llm_calls_total", { status: "error" });
          throw new HttpError(502, (e as Error).message);
        }
      }
    }

    if (r[0] === "export" && m === "GET") {
      const stamp = new Date().toISOString().slice(0, 10);
      if (r[1] === "items.csv") {
        const items = allItems(db).map((it) => ({ ...publicItem(it), ageDays: R.ageDays(it), valueAtCost: R.valueAtCost(it), dead: R.isDead(it) ? "yes" : "" }));
        return text(csv(items, ["sku", "brand", "article", "colour", "size", "cat", "cost", "mrp", "qty", "loc", "valueAtCost", "ageDays", "dead", "createdAt", "lastIn", "lastOut", "lastCount"]), 200, "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="stock-${stamp}.csv"` });
      }
      if (r[1] === "movements.csv") {
        const rows = db.query<MovementRow, []>("SELECT * FROM movements ORDER BY at DESC LIMIT 50000").all().map(publicMovement);
        return text(csv(rows, ["at", "sku", "type", "delta", "before", "after", "note", "by", "source", "ref", "id"]), 200, "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="movements-${stamp}.csv"` });
      }
    }

    // ---- admin ------------------------------------------------------------------
    if (r[0] === "admin") {
      requireAdmin(req);
      if (r[1] === "users") {
        if (!r[2] && m === "GET") return json({ users: db.query<UserRow, []>("SELECT * FROM users ORDER BY role DESC, name").all().map(publicUser) });
        if (!r[2] && m === "POST") {
          const b = await body<{ name?: string; pin?: string; role?: string }>(req);
          const name = String(b.name ?? "").trim().slice(0, 40);
          if (!name) throw new HttpError(400, "Name is required");
          if (!validPin(b.pin)) throw new HttpError(400, "PIN must be 4 to 8 digits");
          const role = b.role === "admin" ? "admin" : "staff";
          if (db.query("SELECT 1 FROM users WHERE name = ?").get(name)) throw new HttpError(409, "A user with that name exists");
          const id = crypto.randomUUID();
          db.query("INSERT INTO users (id, name, pin_hash, role, active, created_at) VALUES (?,?,?,?,1,?)").run(id, name, await hashPin(b.pin), role, now());
          audit(db, { userId: session.userId, actor: session.name, action: "add_user", target: id, detail: { name, role }, ip: ip(req) });
          return json({ user: publicUser(db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(id)!) }, 201);
        }
        if (r[2] && m === "PATCH") {
          const u = db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(r[2]);
          if (!u) throw new HttpError(404, "User not found");
          const b = await body<{ active?: boolean; pin?: string; role?: string; name?: string }>(req);
          if (b.active === false && u.id === session.userId) throw new HttpError(400, "You cannot deactivate yourself");
          if (b.role && b.role !== "admin" && u.id === session.userId) throw new HttpError(400, "You cannot demote yourself");
          if (b.pin !== undefined) {
            if (!validPin(b.pin)) throw new HttpError(400, "PIN must be 4 to 8 digits");
            db.query("UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?").run(await hashPin(b.pin), u.id);
          }
          if (b.active !== undefined) db.query("UPDATE users SET active = ? WHERE id = ?").run(b.active ? 1 : 0, u.id);
          if (b.role) db.query("UPDATE users SET role = ? WHERE id = ?").run(b.role === "admin" ? "admin" : "staff", u.id);
          if (b.name) db.query("UPDATE users SET name = ? WHERE id = ?").run(String(b.name).trim().slice(0, 40), u.id);
          audit(db, { userId: session.userId, actor: session.name, action: "edit_user", target: u.id, detail: { active: b.active, role: b.role, pinReset: b.pin !== undefined, name: b.name }, ip: ip(req) });
          return json({ user: publicUser(db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(u.id)!) });
        }
      }
      if (r[1] === "api-keys") {
        if (!r[2] && m === "GET") return json({ keys: db.query<ApiKeyRow, []>("SELECT * FROM api_keys ORDER BY created_at DESC").all().map(publicKey) });
        if (!r[2] && m === "POST") {
          const b = await body<{ name?: string; scopes?: string[] }>(req);
          const name = String(b.name ?? "").trim().slice(0, 60);
          if (!name) throw new HttpError(400, "Name the key (e.g. Website)");
          const scopes = (Array.isArray(b.scopes) ? b.scopes : ["read"]).filter((s): s is Scope => s === "read" || s === "write");
          if (!scopes.includes("read")) scopes.unshift("read");
          const g = generateApiKey();
          const id = crypto.randomUUID();
          db.query("INSERT INTO api_keys (id, name, prefix, key_hash, scopes, created_at) VALUES (?,?,?,?,?,?)").run(id, name, g.prefix, g.hash, JSON.stringify(scopes), now());
          audit(db, { userId: session.userId, actor: session.name, action: "create_api_key", target: id, detail: { name, scopes }, ip: ip(req) });
          return json({ key: g.full, record: publicKey(db.query<ApiKeyRow, [string]>("SELECT * FROM api_keys WHERE id = ?").get(id)!) }, 201);
        }
        if (r[2] && m === "DELETE") {
          const k = db.query<ApiKeyRow, [string]>("SELECT * FROM api_keys WHERE id = ?").get(r[2]);
          if (!k) throw new HttpError(404, "Key not found");
          db.query("UPDATE api_keys SET revoked_at = ? WHERE id = ?").run(now(), k.id);
          audit(db, { userId: session.userId, actor: session.name, action: "revoke_api_key", target: k.id, detail: { name: k.name }, ip: ip(req) });
          return json({ ok: true });
        }
      }
      if (r[1] === "settings") {
        if (m === "GET") return json({ settings: publicSettings(db) });
        if (m === "PUT") {
          const b = await body<{ shop?: string; appUrl?: string; sizeRuns?: Record<string, string[]>; llm?: Parameters<typeof setLlmConfig>[2] }>(req);
          if (b.shop !== undefined) setSetting(db, "shop", String(b.shop).trim().slice(0, 60) || "Ideal Shoes");
          if (b.appUrl !== undefined) setSetting(db, "appUrl", String(b.appUrl).trim().slice(0, 200));
          if (b.sizeRuns && typeof b.sizeRuns === "object") {
            const runs: Record<string, string[]> = {};
            for (const [k, v] of Object.entries(b.sizeRuns)) if (Array.isArray(v)) runs[k.slice(0, 20)] = v.map((s) => String(s).trim().slice(0, 8)).filter(Boolean).slice(0, 30);
            setSetting(db, "sizeRuns", { ...DEFAULT_SIZE_RUNS, ...runs });
          }
          if (b.llm) await setLlmConfig(db, opts.secret, b.llm);
          audit(db, { userId: session.userId, actor: session.name, action: "edit_settings", detail: { keys: Object.keys(b), llmKeyChanged: Boolean(b.llm?.apiKey || b.llm?.clearKey) }, ip: ip(req) });
          return json({ settings: publicSettings(db) });
        }
      }
      if (r[1] === "audit" && m === "GET") {
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 200) | 0));
        return json({ audit: db.query("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit) });
      }
      if (r[1] === "import" && r[2] === "csv" && m === "POST") {
        const rows = parseCsv(await req.text());
        if (!rows.length) throw new HttpError(400, "No rows found in the CSV");
        const results = addStock(db, rows, { userId: session.userId, source: "import" });
        const added = results.filter((x) => x.movement.type === "new").length;
        audit(db, { userId: session.userId, actor: session.name, action: "import_csv", detail: { rows: rows.length, added, merged: results.length - added }, ip: ip(req) });
        return json({ rows: rows.length, added, merged: results.length - added });
      }
      if (r[1] === "backup" && m === "GET") {
        const dir = join(opts.publicDir, "..", "backups");
        const file = await backup(dir);
        audit(db, { userId: session.userId, actor: session.name, action: "download_backup", ip: ip(req) });
        return new Response(Bun.file(file), { headers: { "content-type": "application/vnd.sqlite3", "content-disposition": `attachment; filename="${file.split("/").pop()}"` } });
      }
    }

    throw new HttpError(404, "Not found");
  }

  // -------------------------------------------------------------------------
  const pubRoot = normalize(opts.publicDir);
  async function staticFile(p: string): Promise<Response> {
    let rel = p === "/" ? "/index.html" : p;
    if (!extname(rel)) rel = "/index.html"; // single-page app: any clean path is the app
    const full = normalize(join(pubRoot, rel));
    if (!full.startsWith(pubRoot)) throw new HttpError(404, "Not found");
    const f = Bun.file(full);
    if (!(await f.exists())) throw new HttpError(404, "Not found");
    const ext = extname(full);
    const cache = ext === ".html" || rel === "/sw.js" || rel === "/manifest.webmanifest" ? "no-cache" : "public, max-age=86400";
    return new Response(f, { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": cache } });
  }

  const SECURITY_HEADERS: Record<string, string> = {
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(self), microphone=(), geolocation=()",
  };

  async function handle(req: Request): Promise<Response> {
    const started = performance.now();
    const url = new URL(req.url);
    let res: Response;
    let user: string | null = null;
    try {
      res = await route(req, url);
    } catch (e) {
      if (e instanceof HttpError || e instanceof StockError) res = json({ error: e.message }, e.status);
      else {
        console.error(e);
        res = json({ error: "Something went wrong on the server" }, 500);
      }
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
    const out = new Response(res.body, { status: res.status, headers });
    const ms = performance.now() - started;
    const label = M.routeLabel(req.method, url.pathname);
    M.inc("stockroom_http_requests_total", { route: label, status: out.status });
    M.observe("stockroom_http_request_seconds", { route: label }, ms / 1000);
    if (url.pathname.startsWith("/api/") || out.status >= 400) {
      try {
        user = sessionFromRequest(db, opts.secret, req)?.name ?? null;
      } catch {
        user = null;
      }
      log({ t: now(), m: req.method, p: url.pathname, s: out.status, ms: Math.round(ms), u: user, ip: ip(req) });
    }
    return out;
  }

  return { fetch: handle, db, backup };
}

function openApiSpec(origin: string) {
  return {
    openapi: "3.0.3",
    info: { title: "Stock Room public API", version: "1", description: "Read stock and record movements. Authenticate with header X-API-Key (create keys in Admin → API keys). Read-only keys can call GET endpoints; write keys can also POST movements. Intended for the IDEALX website and for LLM agents that answer stock questions." },
    servers: [{ url: `${origin}/api/v1/public` }],
    components: { securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } }, schemas: { Item: { type: "object", properties: { sku: { type: "string" }, brand: { type: "string" }, article: { type: "string" }, colour: { type: "string" }, size: { type: "string" }, cat: { type: "string", enum: [...CATEGORIES] }, qty: { type: "integer" }, mrp: { type: "integer", description: "rupees" }, cost: { type: "integer", description: "rupees" }, loc: { type: "string" }, updatedAt: { type: "string", format: "date-time" } } }, Movement: { type: "object", properties: { id: { type: "string", format: "uuid" }, sku: { type: "string" }, type: { type: "string", enum: ["new", "in", "out", "count", "adj", "delete"] }, delta: { type: "integer" }, before: { type: "integer" }, after: { type: "integer" }, note: { type: "string" }, ref: { type: "string", nullable: true }, at: { type: "string", format: "date-time" } } } } },
    security: [{ ApiKey: [] }],
    paths: {
      "/stock": { get: { summary: "All items with current quantity", responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { asOf: { type: "string" }, items: { type: "array", items: { $ref: "#/components/schemas/Item" } } } } } } } } } },
      "/items/{sku}": { get: { summary: "One item with its last 50 movements", parameters: [{ name: "sku", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { description: "Unknown SKU" } } } },
      "/summary": { get: { summary: "Aggregated digest: totals, ageing, dead stock, top sellers, size gaps. Designed for LLM consumption.", responses: { "200": { description: "OK" } } } },
      "/movements": { post: { summary: "Record a stock movement (idempotent on id)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["sku", "type"], properties: { id: { type: "string", format: "uuid", description: "Client-generated; repeating it returns the original result" }, sku: { type: "string" }, type: { type: "string", enum: ["in", "out", "count", "adj"] }, delta: { type: "integer", description: "for in/out/adj; negative for out" }, counted: { type: "integer", description: "for count" }, note: { type: "string" }, ref: { type: "string" } } } } } }, responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/Item" }, movement: { $ref: "#/components/schemas/Movement" }, idempotent: { type: "boolean" } } } } } }, "403": { description: "Key lacks write scope" }, "404": { description: "Unknown SKU" } } } },
    },
  };
}
