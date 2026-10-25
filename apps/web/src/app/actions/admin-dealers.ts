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

/** Dealers apply without a password. Until SMS login is set up, the admin sets one to hand over. */
export async function setDealerPasswordAction(dealerUserId: string, formData: FormData) {
  const user = await requireAdmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) throw new Error("Use at least 10 characters");
  const bcrypt = (await import("bcryptjs")).default;
  await prisma.user.update({ where: { id: dealerUserId, userType: "dealer" }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await prisma.auditLog.create({ data: { actorUserId: user.id, action: "dealer.set_password", entityType: "user", entityId: dealerUserId } });
  revalidatePath("/admin/dealers");
}
