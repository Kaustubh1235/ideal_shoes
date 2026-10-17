import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inr } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { WholesaleAddToCart } from "@/components/wholesale/add-to-cart";

export const dynamic = "force-dynamic";

export default async function WholesaleProductPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  const dealer = await prisma.dealerProfile.findUnique({ where: { userId: session!.user.id } });
  const tier = dealer?.priceTier ?? "tier_b";

  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      variants: { where: { isActive: true }, orderBy: { size: "asc" } },
      images: { orderBy: [{ isPrimary: "desc" }] },
    },
  });
  if (!product) notFound();

  const tierEntries = await prisma.dealerPriceListEntry.findMany({
    where: {
      priceListId: (await prisma.dealerPriceList.findUnique({ where: { tier } }))?.id ?? "",
      variantId: { in: product.variants.map((v) => v.id) },
    },
  });
  const priceMap = new Map(tierEntries.map((e) => [e.variantId, e.price]));

  return (
    <div className="container py-8 grid gap-8 md:grid-cols-2">
      <div>
        <div className="aspect-square rounded bg-leather-50 overflow-hidden">
          {product.images[0] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={product.images[0].url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grid place-items-center text-ink/30 text-xs">No image</div>
          )}
        </div>
      </div>
      <div>
        <h1 className="font-display text-2xl uppercase">{product.name}</h1>
        <p className="text-sm text-ink/60">{product.sku} · HSN {product.hsnCode}</p>

        <div className="mt-6 rounded border border-leather-100 bg-cream overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Tier Price</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead>Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((v) => {
                const tierPrice = priceMap.get(v.id) ?? v.priceOverride ?? product.basePrice;
                return (
                  <TableRow key={v.id}>
                    <TableCell>UK {v.size}</TableCell>
                    <TableCell>{v.color}</TableCell>
                    <TableCell className="text-right font-medium">{inr(tierPrice)}</TableCell>
                    <TableCell className="text-right text-ink/50 line-through">{inr(product.mrp ?? product.basePrice)}</TableCell>
                    <TableCell><WholesaleAddToCart variantId={v.id} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
