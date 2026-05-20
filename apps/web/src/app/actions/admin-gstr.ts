"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiFetch } from "@/lib/api";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
}

export async function triggerExportAction(formData: FormData) {
  await requireAdmin();
  const month = formData.get("month") as string;
  if (!month) throw new Error("missing_month");
  await apiFetch("/gstr/r1/export", {
    method: "POST",
    body: JSON.stringify({ month }),
  });
  revalidatePath("/admin/gstr");
}
