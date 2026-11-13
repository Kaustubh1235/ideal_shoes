"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import env from "@/env";
import { getInternalToken } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
  return session.user;
}

const VariantSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  priceOverride: z.string().optional(),
  // The Stock Room code on the box label (e.g. IDEA-DMSBOOT-BLA-9); the stock sync matches on it.
  barcode: z.string().trim().max(60).optional(),
});

export async function addVariantAction(productId: string, formData: FormData) {
  const user = await requireAdmin();
  const parsed = VariantSchema.parse(Object.fromEntries(formData.entries()));

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { sku: true } });
  if (!product) throw new Error("not_found");

  const variant = await prisma.productVariant.create({
    data: {
      productId,
      sku: `${product.sku}-${parsed.size}-${parsed.color}`.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
      size: parsed.size,
      color: parsed.color,
      priceOverride: parsed.priceOverride ? Number.parseInt(parsed.priceOverride, 10) * 100 : null,
      barcode: parsed.barcode ? parsed.barcode.toUpperCase() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "variant.create",
      entityType: "product_variant",
      entityId: variant.id,
      after: { size: variant.size, color: variant.color },
    },
  });

  revalidatePath(`/admin/products/${productId}`);
}

export async function toggleStatusAction(productId: string) {
  const user = await requireAdmin();
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { status: true } });
  if (!p) throw new Error("not_found");
  const next = p.status === "active" ? "draft" : "active";
  await prisma.product.update({ where: { id: productId }, data: { status: next } });
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "product.status_change",
      entityType: "product",
      entityId: productId,
      before: { status: p.status },
      after: { status: next },
    },
  });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
}

export async function setVariantBarcodeAction(productId: string, variantId: string, formData: FormData) {
  const user = await requireAdmin();
  const barcode = String(formData.get("barcode") ?? "").trim().toUpperCase().slice(0, 60) || null;
  await prisma.productVariant.update({ where: { id: variantId, productId }, data: { barcode } });
  await prisma.auditLog.create({
    data: { actorUserId: user.id, action: "variant.barcode", entityType: "product_variant", entityId: variantId, after: { barcode } },
  });
  revalidatePath(`/admin/products/${productId}`);
}

export async function uploadImageAction(productId: string, formData: FormData) {
  const user = await requireAdmin();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a photo first");
  const body = new FormData();
  body.append("file", file, file.name || "photo");
  const r = await fetch(`${env.INTERNAL_API_URL}/uploads/product-image`, {
    method: "POST",
    headers: { authorization: `Bearer ${await getInternalToken()}` },
    body,
  });
  if (!r.ok) {
    const detail = ((await r.json().catch(() => null)) as { detail?: string } | null)?.detail;
    throw new Error(detail === "image_too_large" ? "Photo is over 5 MB" : detail === "use_jpeg_png_or_webp" || detail === "not_an_image" ? "Use a JPEG, PNG or WebP photo" : "Upload failed");
  }
  const { url } = (await r.json()) as { url: string };
  const count = await prisma.productImage.count({ where: { productId } });
  const img = await prisma.productImage.create({
    data: { productId, url, alt: String(formData.get("alt") ?? "").slice(0, 200) || null, sortOrder: count, isPrimary: count === 0 },
  });
  await prisma.auditLog.create({ data: { actorUserId: user.id, action: "image.upload", entityType: "product_image", entityId: img.id } });
  revalidatePath(`/admin/products/${productId}`);
}

export async function setPrimaryImageAction(productId: string, imageId: string) {
  await requireAdmin();
  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
    prisma.productImage.update({ where: { id: imageId, productId }, data: { isPrimary: true } }),
  ]);
  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteImageAction(productId: string, imageId: string) {
  const user = await requireAdmin();
  const img = await prisma.productImage.delete({ where: { id: imageId, productId } });
  if (img.isPrimary) {
    const next = await prisma.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: "asc" } });
    if (next) await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await prisma.auditLog.create({ data: { actorUserId: user.id, action: "image.delete", entityType: "product_image", entityId: imageId } });
  revalidatePath(`/admin/products/${productId}`);
}
