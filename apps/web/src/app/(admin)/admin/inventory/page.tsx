import { prisma } from "@/lib/prisma";
import { Badge, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { adjustInventoryAction } from "@/app/actions/admin-inventory";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const inventory = await prisma.inventory.findMany({
    include: {
      variant: { include: { product: { select: { name: true, sku: true } } } },
      warehouse: true,
    },
    orderBy: [{ onHand: "asc" }],
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase">Inventory</h1>
      <p className="text-sm text-ink/60">All stock changes are written to <code>stock_movements</code> as an append-only ledger.</p>

      <div className="rounded-lg border border-leather-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">On Hand</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Reorder At</TableHead>
              <TableHead>Adjust</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.map((inv) => (
              <TableRow key={inv.variantId}>
                <TableCell className="font-mono text-xs">{inv.variant.sku}</TableCell>
                <TableCell>{inv.variant.product.name} · UK {inv.variant.size}</TableCell>
                <TableCell>{inv.warehouse.name}</TableCell>
                <TableCell className="text-right">
                  {inv.onHand <= inv.reorderPoint ? <Badge variant="warning">{inv.onHand}</Badge> : inv.onHand}
                </TableCell>
                <TableCell className="text-right">{inv.reserved}</TableCell>
                <TableCell className="text-right">{inv.reorderPoint}</TableCell>
                <TableCell>
                  <form action={adjustInventoryAction.bind(null, inv.variantId, inv.warehouseId)} className="flex gap-1">
                    <Input name="delta" placeholder="±" className="w-20 h-8" type="number" required />
                    <Input name="note" placeholder="Reason" className="w-32 h-8" />
                    <Button type="submit" size="sm" variant="outline">Apply</Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {inventory.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-ink/60">No inventory rows yet. Seed data first.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
