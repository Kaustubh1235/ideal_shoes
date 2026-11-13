import { prisma } from "@/lib/prisma";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { inr } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminPosPage() {
  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { supplier: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase">Purchase Orders</h1>
      <p className="text-sm text-ink/60">Inbound POs to suppliers (raw leather, soles, fasteners). Wire your suppliers in /admin/suppliers (TODO).</p>
      <div className="rounded-lg border border-leather-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO No.</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.poNo}</TableCell>
                <TableCell>{p.supplier.name}</TableCell>
                <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                <TableCell>{p.expectedAt?.toLocaleDateString("en-IN") ?? "—"}</TableCell>
                <TableCell className="text-right">{inr(p.grandTotal)}</TableCell>
              </TableRow>
            ))}
            {pos.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-ink/60">No purchase orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
