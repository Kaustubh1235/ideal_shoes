import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inr } from "@/lib/money";
import { Badge } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function OrdersListPage() {
  const session = await auth();
  const orders = await prisma.order.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl uppercase tracking-wide">All Orders</h1>
      <div className="mt-6 space-y-2">
        {orders.length === 0 && <p className="text-ink/60 text-sm">No orders yet.</p>}
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/account/orders/${o.id}`}
            className="flex flex-wrap justify-between items-center gap-2 rounded border border-olive-100 bg-cream p-4 hover:border-olive-300"
          >
            <div>
              <p className="font-medium">{o.orderNo}</p>
              <p className="text-xs text-ink/60">{o.placedAt?.toLocaleDateString("en-IN") ?? "—"}</p>
            </div>
            <Badge variant="outline">{o.status}</Badge>
            <span className="font-medium">{inr(o.grandTotal)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
