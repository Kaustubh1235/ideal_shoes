"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/require-staff";
import { auth } from "@/auth";
import { apiFetch } from "@/lib/api";

async function requireAdmin() {
  return requireStaff();
}

export async function createTenderAction(formData: FormData) {
  await requireAdmin();
  const submission = formData.get("submission_deadline") as string | null;
  const value = formData.get("estimated_value") as string | null;
  await apiFetch("/tenders", {
    method: "POST",
    body: JSON.stringify({
      title: formData.get("title"),
      buyer_org: formData.get("buyer_org"),
      description: formData.get("description") || undefined,
      submission_deadline: submission ? new Date(submission).toISOString() : undefined,
      estimated_value: value ? Number.parseFloat(value) : undefined,
      url: formData.get("url") || undefined,
      category: formData.get("category") || undefined,
      status: "new",
    }),
  });
  redirect("/admin/tenders");
}
