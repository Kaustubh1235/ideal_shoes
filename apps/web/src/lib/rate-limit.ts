import { redis } from "@/lib/redis";

/**
 * Fixed-window counter in Redis. Returns true while `key` is under `max` hits per `windowSec`.
 * Fails open if Redis is down: a login outage is worse than a short gap in throttling.
 */
export async function hit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const k = `rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    return n <= max;
  } catch {
    return true;
  }
}

export async function clear(key: string): Promise<void> {
  try {
    await redis.del(`rl:${key}`);
  } catch {
    /* ignore */
  }
}

/** The proxy (Caddy) overwrites X-Real-IP with the connecting address. */
export function clientIp(req: Request | undefined): string {
  return req?.headers.get("x-real-ip")?.trim() || "unknown";
}
