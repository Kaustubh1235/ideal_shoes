import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inr } from "@/lib/money";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function WholesaleOrdersPage() {
  const session = await auth();
  const orders = await prisma.order.findMany({
    where: { userId: session!.user.id, channel: "wholesale" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl uppercase">Your Orders</h1>
      <div className="mt-6 rounded-lg border border-olive-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell><Link href={`/wholesale/orders/${o.id}`} className="hover:text-olive-700 font-medium">{o.orderNo}</Link></TableCell>
                <TableCell>{o.createdAt.toLocaleDateString("en-IN")}</TableCell>
                <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                <TableCell className="text-right">{inr(o.grandTotal)}</TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-ink/60">No wholesale orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
