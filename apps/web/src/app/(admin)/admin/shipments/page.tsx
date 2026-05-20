import { prisma } from "@/lib/prisma";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function AdminShipmentsPage() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { order: { select: { orderNo: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase">Shipments</h1>
      <p className="text-sm text-ink/60">
        Configure Shiprocket / Delhivery in <code>.env</code> to enable one-click AWB generation. See NEXT-STEPS step 9.
      </p>
      <div className="rounded-lg border border-olive-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Courier</TableHead>
              <TableHead>AWB</TableHead>
              <TableHead>E-way Bill</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.createdAt.toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{s.order.orderNo}</TableCell>
                <TableCell>{s.courier ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{s.awb ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{s.ewayBillNo ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
              </TableRow>
            ))}
            {shipments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-ink/60">No shipments yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
