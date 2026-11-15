"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/require-staff";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  delta: z.coerce.number().int(),
  note: z.string().max(200).optional(),
});

async function requireAdmin() {
  return requireStaff();
}

export async function adjustInventoryAction(variantId: string, warehouseId: string, formData: FormData) {
  const user = await requireAdmin();
  const { delta, note } = Schema.parse({
    delta: formData.get("delta"),
    note: formData.get("note") ?? undefined,
  });
  if (delta === 0) return;

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        variantId,
        warehouseId,
        delta,
        reason: "adjustment",
        note: note ?? null,
        createdBy: user.id,
      },
    }),
    prisma.inventory.update({
      where: { variantId },
      data: { onHand: { increment: delta } },
    }),
    prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "inventory.adjust",
        entityType: "inventory",
        entityId: variantId,
        after: { delta, note },
      },
    }),
  ]);

  revalidatePath("/admin/inventory");
}
