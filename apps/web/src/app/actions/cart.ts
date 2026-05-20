"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateCartId, addToCart, setCartQty, removeFromCart, clearCart } from "@/lib/cart";

const AddSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
});

export async function addToCartAction(
  variantId: string,
  qty: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = AddSchema.safeParse({ variantId, qty });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  // Validate variant exists and is active
  const variant = await prisma.productVariant.findUnique({
    where: { id: parsed.data.variantId },
    select: { id: true, isActive: true },
  });
  if (!variant || !variant.isActive) return { ok: false, error: "Variant unavailable" };

  const cartId = await getOrCreateCartId();
  await addToCart(cartId, parsed.data.variantId, parsed.data.qty);
  revalidatePath("/cart");
  return { ok: true };
}

export async function updateCartQtyAction(variantId: string, qty: number) {
  const cartId = await getOrCreateCartId();
  await setCartQty(cartId, variantId, qty);
  revalidatePath("/cart");
}

export async function removeCartItemAction(variantId: string) {
  const cartId = await getOrCreateCartId();
  await removeFromCart(cartId, variantId);
  revalidatePath("/cart");
}

export async function clearCartAction() {
  const cartId = await getOrCreateCartId();
  await clearCart(cartId);
  revalidatePath("/cart");
}
