import { Database } from "bun:sqlite";

export type Role = "admin" | "staff";

export interface UserRow {
  id: string;
  name: string;
  pin_hash: string;
  role: Role;
  active: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
}

export interface ItemRow {
  sku: string;
  brand: string;
  article: string;
  colour: string;
  size: string;
  cat: string;
  cost: number;
  mrp: number;
  qty: number;
  loc: string;
  created_at: string;
  last_in: string | null;
  last_out: string | null;
  last_count: string | null;
  updated_at: string;
}

export interface MovementRow {
  id: string;
  sku: string;
  type: string;
  delta: number;
  before_qty: number;
  after_qty: number;
  note: string;
  by_user: string | null;
  source: string;
  ref: string | null;
  at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  sku TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  article TEXT NOT NULL,
  colour TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '-',
  cat TEXT NOT NULL DEFAULT 'shoe',
  cost INTEGER NOT NULL DEFAULT 0,
  mrp INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  loc TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_in TEXT,
  last_out TEXT,
  last_count TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_items_brand ON items(brand);
CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  type TEXT NOT NULL,
  delta INTEGER NOT NULL,
  before_qty INTEGER NOT NULL,
  after_qty INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  by_user TEXT,
  source TEXT NOT NULL DEFAULT 'app',
  ref TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_movements_sku_at ON movements(sku, at);
CREATE INDEX IF NOT EXISTS ix_movements_at ON movements(at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit(at);
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  model TEXT NOT NULL
);
`;

export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

export const now = () => new Date().toISOString();

export function getSetting<T = unknown>(db: Database, key: string, fallback: T): T {
  const row = db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: Database, key: string, value: unknown): void {
  db.query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    JSON.stringify(value),
  );
}

export function audit(
  db: Database,
  entry: { userId?: string | null; actor: string; action: string; target?: string; detail?: unknown; ip?: string | null },
): void {
  db.query("INSERT INTO audit (at, user_id, actor, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now(),
    entry.userId ?? null,
    entry.actor,
    entry.action,
    entry.target ?? null,
    entry.detail === undefined ? null : JSON.stringify(entry.detail),
    entry.ip ?? null,
  );
}

export function allItems(db: Database): ItemRow[] {
  return db.query<ItemRow, []>("SELECT * FROM items ORDER BY brand, article, colour, size").all();
}

export function getItem(db: Database, sku: string): ItemRow | null {
  return db.query<ItemRow, [string]>("SELECT * FROM items WHERE sku = ?").get(sku) ?? null;
}

export function recentMovements(db: Database, limit = 300, sku?: string): MovementRow[] {
  if (sku) {
    return db
      .query<MovementRow, [string, number]>("SELECT * FROM movements WHERE sku = ? ORDER BY at DESC LIMIT ?")
      .all(sku, limit);
  }
  return db.query<MovementRow, [number]>("SELECT * FROM movements ORDER BY at DESC LIMIT ?").all(limit);
}

export function movementsSince(db: Database, sinceIso: string): MovementRow[] {
  return db.query<MovementRow, [string]>("SELECT * FROM movements WHERE at >= ? ORDER BY at ASC").all(sinceIso);
}
