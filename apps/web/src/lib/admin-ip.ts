/**
 * The optional ADMIN_IP_ALLOWLIST: the addresses (or IPv4 CIDRs) that may use /admin. Checked by the
 * middleware for /admin pages and again inside every admin server action, because a server action can be
 * posted to any path. The proxy overwrites X-Real-IP with the connecting address; X-Forwarded-For is not used.
 */
export function adminIpAllowed(ip: string | null | undefined): boolean {
  const allowlist = (process.env.ADMIN_IP_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowlist.length === 0) return true;
  const addr = (ip ?? "").trim();
  return Boolean(addr) && allowlist.some((cidr) => matchCidr(addr, cidr));
}

// Very lightweight CIDR matcher (IPv4 only). For richer matching, switch to a library.
function matchCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsStr] = cidr.split("/");
  if (!base || !bitsStr) return false;
  const bits = Number.parseInt(bitsStr, 10);
  const ipNum = ipv4ToNum(ip);
  const baseNum = ipv4ToNum(base);
  if (ipNum === null || baseNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function ipv4ToNum(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number.parseInt(p, 10);
    if (Number.isNaN(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}
