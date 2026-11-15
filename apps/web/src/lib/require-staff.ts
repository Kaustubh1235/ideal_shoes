import { headers } from "next/headers";
import { auth } from "@/auth";
import { adminIpAllowed } from "@/lib/admin-ip";

/** For admin server actions: a staff session, from an address the admin allowlist accepts. */
export async function requireStaff() {
  if (!adminIpAllowed((await headers()).get("x-real-ip"))) throw new Error("forbidden");
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
  return session.user;
}
