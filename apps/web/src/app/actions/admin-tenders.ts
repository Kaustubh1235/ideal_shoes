"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiFetch, ApiError } from "@/lib/api";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") throw new Error("forbidden");
}

export async function pollRssAction(): Promise<{ ok: boolean; count?: number; error?: string }> {
  await requireAdmin();
  try {
    const r = await apiFetch<{ ingested: number }>("/tenders/poll/rss", { method: "POST" });
    revalidatePath("/admin/tenders");
    return { ok: true, count: r.ingested };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? `${e.status}` : (e as Error).message };
  }
}

export async function pollEmailAction(): Promise<{ ok: boolean; count?: number; error?: string }> {
  await requireAdmin();
  try {
    const r = await apiFetch<{ ingested: number }>("/tenders/poll/email", { method: "POST" });
    revalidatePath("/admin/tenders");
    return { ok: true, count: r.ingested };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? `${e.status}` : (e as Error).message };
  }
}
