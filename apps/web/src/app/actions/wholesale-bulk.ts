"use server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCartId, addToCart } from "@/lib/cart";

export async function bulkUploadAction(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "dealer") throw new Error("forbidden");

  const file = formData.get("csv") as File | null;
  if (!file) throw new Error("missing_file");
  const text = await file.text();

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift();
  if (!header) throw new Error("empty_csv");
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  const skuIdx = cols.indexOf("sku");
  const sizeIdx = cols.indexOf("size");
  const colorIdx = cols.indexOf("color");
  const qtyIdx = cols.indexOf("quantity");
  if (skuIdx === -1 || sizeIdx === -1 || qtyIdx === -1) {
    throw new Error("missing_columns");
  }

  const cartId = await getOrCreateCartId();
  let added = 0;

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const productSku = parts[skuIdx];
    const size = parts[sizeIdx];
    const color = colorIdx >= 0 ? parts[colorIdx] : undefined;
    const qty = Number.parseInt(parts[qtyIdx] ?? "0", 10);
    if (!productSku || !size || qty < 1) continue;

    const variant = await prisma.productVariant.findFirst({
      where: {
        size,
        ...(color ? { color } : {}),
        product: { sku: productSku },
        isActive: true,
      },
      select: { id: true },
    });
    if (!variant) continue;
    await addToCart(cartId, variant.id, qty);
    added++;
  }

  redirect(`/cart?bulk=${added}`);
}
