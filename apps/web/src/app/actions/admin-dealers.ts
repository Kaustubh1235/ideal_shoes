"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
  return session.user;
}

export async function approveDealerAction(dealerUserId: string) {
  const user = await requireAdmin();
  await prisma.$transaction([
    prisma.dealerProfile.update({
      where: { userId: dealerUserId },
      data: { status: "approved", approvedAt: new Date(), approvedBy: user.id },
    }),
    prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "dealer.approve",
        entityType: "dealer_profile",
        entityId: dealerUserId,
      },
    }),
  ]);
  revalidatePath("/admin/dealers");
}

export async function suspendDealerAction(dealerUserId: string) {
  const user = await requireAdmin();
  await prisma.dealerProfile.update({
    where: { userId: dealerUserId },
    data: { status: "suspended" },
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "dealer.suspend",
      entityType: "dealer_profile",
      entityId: dealerUserId,
    },
  });
  revalidatePath("/admin/dealers");
}
