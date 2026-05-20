"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  sku: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  categorySlug: z.enum(["army_boots", "oxford_shoes", "jackets", "accessories"]),
  hsnCode: z.string().regex(/^[0-9]{4,8}$/),
  basePrice: z.coerce.number().int().min(1),
  mrp: z.coerce.number().int().min(1).optional(),
  weightGrams: z.coerce.number().int().min(1).optional(),
  arEnabled: z.union([z.literal("on"), z.literal("true"), z.boolean(), z.undefined()]).optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") {
    throw new Error("forbidden");
  }
  return session.user;
}

export async function createProductAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = Schema.parse(Object.fromEntries(formData.entries()));

  let cat = await prisma.category.findUnique({ where: { slug: parsed.categorySlug } });
  if (!cat) {
    cat = await prisma.category.create({
      data: {
        slug: parsed.categorySlug,
        name: parsed.categorySlug.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      },
    });
  }

  const created = await prisma.product.create({
    data: {
      sku: parsed.sku,
      slug: parsed.slug,
      name: parsed.name,
      shortDescription: parsed.shortDescription ?? null,
      description: parsed.description ?? null,
      categoryId: cat.id,
      hsnCode: parsed.hsnCode,
      basePrice: parsed.basePrice * 100,
      mrp: parsed.mrp ? parsed.mrp * 100 : null,
      weightGrams: parsed.weightGrams ?? null,
      arEnabled: !!parsed.arEnabled,
      status: "draft",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "product.create",
      entityType: "product",
      entityId: created.id,
      after: { name: created.name, sku: created.sku },
    },
  });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${created.id}`);
}
