import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rupeesOnly } from "@/lib/money";
import { Badge } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function WholesaleCatalogPage() {
  const session = await auth();
  const dealer = await prisma.dealerProfile.findUnique({ where: { userId: session!.user.id } });
  const tier = dealer?.priceTier ?? "tier_b";

  const products = await prisma.product.findMany({
    where: { status: "active" },
    include: {
      variants: { where: { isActive: true } },
      images: { where: { isPrimary: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  // Fetch tier prices for all variants in one go
  const tierList = await prisma.dealerPriceList.findUnique({
    where: { tier },
    include: { entries: true },
  });
  const tierByVariant = new Map(
    (tierList?.entries ?? []).map((e) => [e.variantId, e.price]),
  );

  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl uppercase">Wholesale Catalog</h1>
      <p className="text-sm text-ink/60 mt-1">Tier: <Badge>{tier.toUpperCase()}</Badge></p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const minVariantPrice = Math.min(
            ...p.variants.map((v) => tierByVariant.get(v.id) ?? v.priceOverride ?? p.basePrice),
          );
          const exGst = p.variants.some((v) => tierByVariant.get(v.id) === minVariantPrice);
          return (
            <Link key={p.id} href={`/wholesale/catalog/${p.slug}`} className="rounded-lg border border-leather-100 bg-cream overflow-hidden hover:border-leather-300">
              <div className="aspect-[4/3] bg-leather-50">
                {p.images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0].url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-ink/30 text-xs">No image</div>
                )}
              </div>
              <div className="p-3">
                <p className="font-display uppercase tracking-wide">{p.name}</p>
                <p className="text-xs text-ink/60 mt-0.5">{p.sku} · {p.variants.length} variants</p>
                <p className="mt-2 font-medium">From {rupeesOnly(minVariantPrice)} <span className="text-xs font-normal text-ink/60">{exGst ? "+ GST" : "incl. GST"}</span></p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
