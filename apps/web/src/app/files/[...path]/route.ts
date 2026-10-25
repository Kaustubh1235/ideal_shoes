import { NextResponse } from "next/server";
import env from "@/env";
import { getInternalToken } from "@/auth";

// Private files (invoices, GSTR exports, tender attachments) are never public in storage.
// This forwards the signed-in user's token to the API, which checks access and answers with a
// five-minute signed link; the browser is sent there.
const ALLOWED = [
  /^invoices\/[0-9a-f-]{36}\/pdf$/,
  /^gstr\/r1\/runs\/[0-9a-f-]{36}\/file$/,
  /^tenders\/[0-9a-f-]{36}\/documents\/\d{1,3}$/,
];

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  if (!ALLOWED.some((re) => re.test(path))) return new NextResponse("Not found", { status: 404 });
  const token = await getInternalToken();
  if (!token) return NextResponse.redirect(new URL(`/login?from=${encodeURIComponent(new URL(req.url).pathname)}`, req.url));
  const r = await fetch(`${env.INTERNAL_API_URL}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: "manual",
    cache: "no-store",
  });
  const to = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && to) return NextResponse.redirect(to, 302);
  return new NextResponse(r.status === 404 ? "Not found" : "Not available", { status: r.status === 404 ? 404 : 502 });
}
