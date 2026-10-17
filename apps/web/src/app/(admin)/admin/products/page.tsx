import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { rupeesOnly } from "@/lib/money";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { variants: true } }, images: { where: { isPrimary: true }, take: 1 } },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-2xl uppercase">Products</h1>
        <Button asChild><Link href="/admin/products/new"><Plus className="size-4" /> New Product</Link></Button>
      </div>

      <div className="rounded-lg border border-leather-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell><Link href={`/admin/products/${p.id}`} className="hover:text-leather-700 font-medium">{p.name}</Link></TableCell>
                <TableCell>{p.hsnCode}</TableCell>
                <TableCell>{p._count.variants}</TableCell>
                <TableCell>{rupeesOnly(p.basePrice)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "active" ? "success" : p.status === "draft" ? "outline" : "secondary"}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell>{p.arEnabled ? "✓" : "—"}</TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-ink/60 py-12">
                  No products yet. <Link href="/admin/products/new" className="underline">Create one</Link> or run <code>pnpm db:seed</code>.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
