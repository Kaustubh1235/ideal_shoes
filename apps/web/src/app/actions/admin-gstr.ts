"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/require-staff";
import { auth } from "@/auth";
import { apiFetch } from "@/lib/api";

async function requireAdmin() {
  return requireStaff();
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
