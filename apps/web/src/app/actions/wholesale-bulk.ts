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
  if (skuIdx === -1 || qtyIdx === -1) {
    throw new Error("missing_columns");
  }

  const cartId = await getOrCreateCartId();
  let added = 0;

  // A row names either a variant SKU (IDX-BOOT-DMS-9-BLACK, as in the example on the page) or a
  // product SKU plus size (and colour, if the product comes in several).
  for (const line of lines.slice(0, 500)) {
    const parts = line.split(",").map((p) => p.trim());
    const sku = parts[skuIdx];
    const size = parts[sizeIdx];
    const color = colorIdx >= 0 ? parts[colorIdx] : undefined;
    const qty = Math.min(Number.parseInt(parts[qtyIdx] ?? "0", 10), 10_000);
    if (!sku || !(qty >= 1)) continue;

    const variant =
      (await prisma.productVariant.findFirst({
        where: { sku: { equals: sku, mode: "insensitive" }, isActive: true, product: { status: "active" } },
        select: { id: true },
      })) ??
      (size
        ? await prisma.productVariant.findFirst({
            where: {
              size: { equals: size, mode: "insensitive" },
              ...(color ? { color: { equals: color, mode: "insensitive" } } : {}),
              product: { sku: { equals: sku, mode: "insensitive" }, status: "active" },
              isActive: true,
            },
            select: { id: true },
          })
        : null);
    if (!variant) continue;
    await addToCart(cartId, variant.id, qty);
    added++;
  }

  redirect(`/cart?bulk=${added}`);
}
