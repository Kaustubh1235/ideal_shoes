import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@bharatboot/ui";
import { inr } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function WholesaleHome() {
  const session = await auth();
  const recent = await prisma.order.findMany({
    where: { userId: session!.user.id, channel: "wholesale" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const totalSpent = recent.reduce((s, o) => s + o.grandTotal, 0);

  return (
    <div className="container py-8 space-y-6">
      <h1 className="font-display text-3xl uppercase">Welcome back</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Orders</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{recent.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Spend</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{inr(totalSpent)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full"><Link href="/wholesale/catalog">Browse Catalog</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link href="/wholesale/bulk-upload">Bulk CSV Upload</Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-ink/60">No wholesale orders yet. <Link href="/wholesale/catalog" className="underline">Start ordering</Link>.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <Link href={`/wholesale/orders/${o.id}`} className="hover:text-olive-700">{o.orderNo} — {o.status}</Link>
                  <span>{inr(o.grandTotal)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
