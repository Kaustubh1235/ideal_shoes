import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { rupeesOnly } from "@/lib/money";
import { Badge } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  bags: "Bags",
  shoes: "Shoes",
  belts_wallets: "Belts & Wallets",
  accessories: "Accessories",
};

export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const category = searchParams.category;
  const q = searchParams.q;

  const where: any = { status: "active" };
  if (category) where.category = { slug: category };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    include: { images: { where: { isPrimary: true }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {category ? CATEGORY_LABELS[category] ?? "Products" : "Everything we make"}
          </h1>
          <p className="text-sm text-ink/60 mt-1">
            {products.length} item{products.length !== 1 ? "s" : ""}
            {q && ` matching "${q}"`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_LABELS).map(([slug, name]) => (
            <Link key={slug} href={`/products?category=${slug}`}>
              <Badge variant={category === slug ? "primary" : "outline"}>{name}</Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.slug}`}
            className="group block overflow-hidden rounded-md border border-leather-100 bg-cream"
          >
            <div className="relative aspect-square bg-leather-50">
              {p.images[0]?.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.images[0].url} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="h-full w-full grid place-items-center text-ink/30 text-xs uppercase">
                  No image
                </div>
              )}
              {p.arEnabled && (
                <span className="absolute top-2 left-2 bg-leather-700 text-cream text-[10px] uppercase tracking-wider px-2 py-0.5 rounded">
                  3D / AR
                </span>
              )}
            </div>
            <div className="p-3">
              <h3 className="font-display text-base group-hover:text-leather-700 line-clamp-2">{p.name}</h3>
              <p className="mt-1 text-sm text-ink/70">{rupeesOnly(p.basePrice)}</p>
              {p.mrp && p.mrp > p.basePrice && (
                <p className="text-xs text-ink/50 line-through">{rupeesOnly(p.mrp)}</p>
              )}
            </div>
          </Link>
        ))}
        {products.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-leather-200 p-12 text-center text-ink/60">
            Nothing here yet. Try another category or seed demo data.
          </div>
        )}
      </div>
    </div>
  );
}
