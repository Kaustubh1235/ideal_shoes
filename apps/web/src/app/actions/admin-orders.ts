"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiFetch } from "@/lib/api";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
  return session.user;
}

export async function markOrderStatusAction(orderId: string, nextStatus: string) {
  const user = await requireAdmin();
  const before = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!before) throw new Error("not_found");

  const data: any = { status: nextStatus };
  if (nextStatus === "shipped") data.shippedAt = new Date();
  if (nextStatus === "delivered") data.deliveredAt = new Date();
  if (nextStatus === "cancelled") data.cancelledAt = new Date();

  await prisma.order.update({ where: { id: orderId }, data });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "order.status_change",
      entityType: "order",
      entityId: orderId,
      before: { status: before.status },
      after: { status: nextStatus },
    },
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
}

export async function generateInvoiceAction(orderId: string) {
  await requireAdmin();
  await apiFetch("/invoices/generate", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId }),
  });
  revalidatePath(`/admin/orders/${orderId}`);
}
