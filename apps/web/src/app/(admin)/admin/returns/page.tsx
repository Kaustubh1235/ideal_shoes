import { prisma } from "@/lib/prisma";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { inr } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminReturnsPage() {
  const returns = await prisma.returnRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase">Returns / RMA</h1>
      <p className="text-sm text-ink/60">Approved returns automatically generate credit notes via the API.</p>
      <div className="rounded-lg border border-olive-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Refund</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.createdAt.toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="font-mono text-xs">{r.orderId}</TableCell>
                <TableCell className="max-w-md truncate">{r.reason}</TableCell>
                <TableCell>{inr(r.refundAmount)}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
            {returns.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-ink/60">No return requests.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
