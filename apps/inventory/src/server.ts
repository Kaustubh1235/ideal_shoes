import { join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createApp } from "./app";

const root = join(dirname(Bun.fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ?? join(root, "data");
const backupDir = process.env.BACKUP_DIR ?? join(root, "backups");
mkdirSync(dataDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

// The signing secret is generated once and kept in the data directory, so a reboot
// does not sign everyone out. APP_SECRET in the environment overrides it.
function loadSecret(): string {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) return process.env.APP_SECRET;
  const f = join(dataDir, "secret.key");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  const s = randomBytes(48).toString("base64url");
  writeFileSync(f, s, { mode: 0o600 });
  return s;
}

const version = process.env.APP_VERSION ?? (() => {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version ?? "dev";
  } catch {
    return "dev";
  }
})();

const app = createApp({
  dbPath: join(dataDir, "stockroom.db"),
  secret: loadSecret(),
  publicDir: join(root, "public"),
  backupDir,
  version,
  metricsToken: process.env.METRICS_TOKEN,
});

const port = Number(process.env.PORT ?? 8787);
const server = Bun.serve({ port, hostname: process.env.HOST ?? "0.0.0.0", fetch: app.fetch });
console.log(JSON.stringify({ t: new Date().toISOString(), msg: "stock room up", port: server.port, version, dataDir }));

// Nightly backup, keep the last 14. Runs once at start too, so a fresh install has a restore point.
async function runBackup() {
  try {
    const file = await app.backup(backupDir);
    const files = readdirSync(backupDir).filter((f) => f.startsWith("stockroom-") && f.endsWith(".db")).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 14))) unlinkSync(join(backupDir, f));
    console.log(JSON.stringify({ t: new Date().toISOString(), msg: "backup written", file }));
  } catch (e) {
    console.error(JSON.stringify({ t: new Date().toISOString(), msg: "backup failed", error: String(e) }));
  }
}
if (process.env.BACKUPS !== "off") {
  setTimeout(runBackup, 5000);
  setInterval(runBackup, 24 * 3600 * 1000);
}
