import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@bharatboot/ui";
import { inr } from "@/lib/money";
import { DashboardCharts } from "@/components/admin/dashboard-charts";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [orderCount, paidCount, dealerPending, lowStock, todaysRevenue, monthRevenue] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo }, status: { in: ["paid", "processing", "packed", "shipped", "delivered"] } } }),
    prisma.dealerProfile.count({ where: { status: "pending" } }),
    prisma.inventory.count({ where: { onHand: { lte: 5 } } }),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: {
        placedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        status: { in: ["paid", "processing", "packed", "shipped", "delivered"] },
      },
    }),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: {
        placedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        status: { in: ["paid", "processing", "packed", "shipped", "delivered"] },
      },
    }),
  ]);

  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { user: { select: { email: true, phone: true } } },
  });

  // 30-day daily revenue series
  const orders30 = await prisma.order.findMany({
    where: { placedAt: { gte: thirtyDaysAgo }, status: { in: ["paid", "processing", "packed", "shipped", "delivered"] } },
    select: { placedAt: true, grandTotal: true },
  });
  const byDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = 0;
  }
  for (const o of orders30) {
    if (!o.placedAt) continue;
    const key = o.placedAt.toISOString().slice(0, 10);
    if (key in byDay) byDay[key] += o.grandTotal;
  }
  const series = Object.entries(byDay).map(([day, value]) => ({ day, value: value / 100 }));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl uppercase">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Today&apos;s Revenue</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{inr(todaysRevenue._sum.grandTotal ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">This Month</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{inr(monthRevenue._sum.grandTotal ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Orders (30d)</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{orderCount} <span className="text-sm text-ink/60">/ {paidCount} paid</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Action Required</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{dealerPending} dealer{dealerPending !== 1 && "s"} awaiting approval</p>
            <p className="text-sm">{lowStock} SKU{lowStock !== 1 && "s"} low stock</p>
          </CardContent>
        </Card>
      </div>

      <DashboardCharts series={series} />

      <Card>
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink/60">
                <th className="py-2">Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-olive-100">
                  <td className="py-2">{o.orderNo}</td>
                  <td>{o.user?.email ?? o.user?.phone ?? "—"}</td>
                  <td>{o.status}</td>
                  <td className="text-right">{inr(o.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
