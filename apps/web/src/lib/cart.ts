/** Redis-backed cart for anonymous + logged-in shoppers.
 *
 * Key: cart:<id>  -- hash of variantId -> qty
 * The cart row in Postgres is created at order time, not on every add-to-cart;
 * Redis holds the volatile shopping intent.
 */
import { redis } from "@/lib/redis";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";

const COOKIE = "bb_cart";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** The visitor's cart id, or null before their first add-to-cart. Safe in pages (read-only). */
export function getCartId(): string | null {
  return cookies().get(COOKIE)?.value ?? null;
}

/** Creates the cart cookie if needed. Only in server actions and route handlers: Next does not
 * allow setting cookies while rendering a page. */
export async function getOrCreateCartId(): Promise<string> {
  const jar = cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id) {
    id = nanoid(24);
    jar.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TTL_SECONDS,
      path: "/",
    });
  }
  return id;
}

export interface CartLine {
  variantId: string;
  quantity: number;
}

export async function getCart(cartId: string | null): Promise<CartLine[]> {
  if (!cartId) return [];
  const raw = await redis.hgetall(`cart:${cartId}`);
  return Object.entries(raw).map(([variantId, qty]) => ({ variantId, quantity: Number.parseInt(qty, 10) }));
}

export async function addToCart(cartId: string, variantId: string, qty: number): Promise<void> {
  if (qty <= 0) return removeFromCart(cartId, variantId);
  const key = `cart:${cartId}`;
  await redis.hincrby(key, variantId, qty);
  await redis.expire(key, TTL_SECONDS);
}

export async function setCartQty(cartId: string, variantId: string, qty: number): Promise<void> {
  if (qty <= 0) return removeFromCart(cartId, variantId);
  const key = `cart:${cartId}`;
  await redis.hset(key, variantId, qty);
  await redis.expire(key, TTL_SECONDS);
}

export async function removeFromCart(cartId: string, variantId: string): Promise<void> {
  await redis.hdel(`cart:${cartId}`, variantId);
}

export async function clearCart(cartId: string): Promise<void> {
  await redis.del(`cart:${cartId}`);
}

export async function cartCount(cartId: string | null): Promise<number> {
  if (!cartId) return 0;
  const all = await redis.hvals(`cart:${cartId}`);
  return all.reduce((s, v) => s + Number.parseInt(v, 10), 0);
}
