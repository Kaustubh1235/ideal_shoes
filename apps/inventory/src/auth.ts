import { createHmac, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import { now, type UserRow } from "./db";

export const SESSION_COOKIE = "sr_session";
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signToken(secret: string, payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(secret: string, token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashPin(pin: string): Promise<string> {
  return Bun.password.hash(pin, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 });
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(pin, hash);
  } catch {
    return false;
  }
}

export function validPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^[0-9]{4,8}$/.test(pin);
}

export interface Session {
  userId: string;
  name: string;
  role: "admin" | "staff";
}

export function issueSession(secret: string, user: UserRow): { token: string; cookie: string } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const token = signToken(secret, { sub: user.id, role: user.role, exp, iat: Math.floor(Date.now() / 1000) });
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
  return { token, cookie };
}

export const clearSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionFromRequest(db: Database, secret: string, req: Request): Session | null {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const payload = verifyToken(secret, token);
  if (!payload || typeof payload.sub !== "string") return null;
  const user = db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ? AND active = 1").get(payload.sub);
  if (!user) return null;
  return { userId: user.id, name: user.name, role: user.role };
}

export type LoginResult =
  | { ok: true; user: UserRow }
  | { ok: false; reason: "no_user" | "locked" | "bad_pin"; lockedUntil?: string };

export async function attemptLogin(db: Database, userId: string, pin: string): Promise<LoginResult> {
  const user = db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ? AND active = 1").get(userId);
  if (!user) return { ok: false, reason: "no_user" };
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    return { ok: false, reason: "locked", lockedUntil: user.locked_until };
  }
  const good = await verifyPin(pin, user.pin_hash);
  if (good) {
    db.query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(user.id);
    return { ok: true, user };
  }
  const fails = user.failed_attempts + 1;
  if (fails >= MAX_FAILS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    db.query("UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?").run(until, user.id);
    return { ok: false, reason: "locked", lockedUntil: until };
  }
  db.query("UPDATE users SET failed_attempts = ? WHERE id = ?").run(fails, user.id);
  return { ok: false, reason: "bad_pin" };
}

// ---- API keys -------------------------------------------------------------

export type Scope = "read" | "write";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  key_hash: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function generateApiKey(): { full: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const full = `idx_${prefix}_${secret}`;
  return { full, prefix, hash: createHash("sha256").update(full).digest("hex") };
}

export function apiKeyFromRequest(db: Database, req: Request): { id: string; name: string; scopes: Scope[] } | null {
  const raw = req.headers.get("x-api-key") || bearer(req);
  if (!raw) return null;
  const m = /^idx_([0-9a-f]{12})_[A-Za-z0-9_-]{20,}$/.exec(raw);
  if (!m) return null;
  const row = db.query<ApiKeyRow, [string]>("SELECT * FROM api_keys WHERE prefix = ? AND revoked_at IS NULL").get(m[1]);
  if (!row) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(row.key_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  db.query("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id);
  let scopes: Scope[] = [];
  try {
    scopes = JSON.parse(row.scopes);
  } catch {
    scopes = [];
  }
  return { id: row.id, name: row.name, scopes };
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

// ---- Secret-at-rest for LLM keys -----------------------------------------

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = createHash("sha256").update(`stockroom-kms:${secret}`).digest();
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string, plain: string): Promise<string> {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
}

export async function decryptSecret(secret: string, enc: string): Promise<string> {
  const [ivB, ctB] = enc.split(".");
  const key = await aesKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivB, "base64url") },
    key,
    Buffer.from(ctB, "base64url"),
  );
  return new TextDecoder().decode(pt);
}
