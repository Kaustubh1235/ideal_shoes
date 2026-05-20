import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { inr } from "@/lib/money";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function AdminOrdersList() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true, phone: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase">Orders</h1>
      <div className="rounded-lg border border-olive-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell><Link href={`/admin/orders/${o.id}`} className="font-medium hover:text-olive-700">{o.orderNo}</Link></TableCell>
                <TableCell>{o.createdAt.toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{o.user?.email ?? o.user?.phone ?? "Guest"}</TableCell>
                <TableCell>{o.channel}</TableCell>
                <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                <TableCell className="text-right">{inr(o.grandTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
