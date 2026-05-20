"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
  return session.user;
}

const VariantSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  priceOverride: z.string().optional(),
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
