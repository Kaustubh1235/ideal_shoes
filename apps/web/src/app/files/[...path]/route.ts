import { NextResponse } from "next/server";
import env from "@/env";
import { auth, getInternalToken, getServiceToken } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  // Guest orders: the unguessable order id is the buyer's key (as on the pay page), so the
  // invoice is fetched with the web service token after checking the order has no account.
  const guest = path.match(/^orders\/([0-9a-f-]{36})\/invoice$/);
  if (guest) return guestInvoice(guest[1]!);
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

async function guestInvoice(orderId: string) {
  const session = await auth();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { invoices: { take: 1 } } });
  const mine = order?.userId && (order.userId === session?.user?.id || session?.user?.userType === "staff");
  if (!order || (order.userId && !mine) || !order.invoices[0]) return new NextResponse("Not found", { status: 404 });
  const r = await fetch(`${env.INTERNAL_API_URL}/invoices/${order.invoices[0].id}/pdf`, {
    headers: { authorization: `Bearer ${await getServiceToken()}` },
    redirect: "manual",
    cache: "no-store",
  });
  const to = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && to) return NextResponse.redirect(to, 302);
  return new NextResponse("Not available", { status: 502 });
}
