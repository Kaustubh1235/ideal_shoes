import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, View } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { rupeesOnly, inr } from "@/lib/money";
import { Button } from "@bharatboot/ui";
import { AddToCart } from "@/components/storefront/add-to-cart";
import { seller } from "@/lib/seller";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } },
  });
  if (!p || p.status !== "active") return { title: "Not found", robots: { index: false } };
  const description = p.shortDescription ?? `${p.name}, made in the IDEALX factory in Agra. ${rupeesOnly(p.basePrice)} incl. GST.`;
  return {
    title: p.name,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.name, description, type: "website", images: p.images[0] ? [{ url: p.images[0].url, alt: p.name }] : undefined },
  };
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      variants: { where: { isActive: true }, orderBy: { size: "asc" } },
      category: true,
    },
  });
  if (!product || product.status !== "active") notFound();

  // Legal Metrology (Packaged Commodities) Rules, 2011, rule 6(10): declarations an online
  // listing must show. Product meta overrides; otherwise the seller's own details apply.
  const meta = (product.metaJson ?? {}) as Record<string, any>;
  const s = seller();
  const paired = ["boots", "shoes"].includes(product.category?.slug ?? "");
  const declarations: [string, string][] = [
    ["MRP", `${inr(product.mrp ?? product.basePrice)} (incl. of all taxes)`],
    ["Generic name", meta.genericName ?? product.category?.name ?? product.name],
    ["Net quantity", meta.netQuantity ?? (paired ? "1 pair" : "1 N (one piece)")],
    ["Country of origin", meta.countryOfOrigin ?? "India"],
    ["Manufactured by", meta.manufacturer ?? `${s.legalName}, ${s.address}`],
    ["Customer care", [s.phone, s.email].filter(Boolean).join(" · ") || "See the Contact page"],
  ];

  return (
    <div className="container py-8">
      <nav className="text-xs text-ink/60 flex items-center gap-1 mb-4">
        <Link href="/" className="hover:text-leather-700">Home</Link>
        <ChevronRight className="size-3" />
        <Link href="/products" className="hover:text-leather-700">Products</Link>
        {product.category && (
          <>
            <ChevronRight className="size-3" />
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-leather-700">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3" />
        <span className="text-ink/80">{product.name}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="aspect-square bg-leather-50 rounded-md overflow-hidden border border-leather-100">
            {product.images[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={product.images[0].url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full grid place-items-center text-ink/30 text-sm uppercase">
                No image yet — upload via admin
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {product.images.slice(0, 4).map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={img.id} src={img.url} alt={img.alt ?? ""} className="aspect-square w-full rounded object-cover border border-leather-100" />
              ))}
            </div>
          )}
          {product.arEnabled && (
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href={`/ar/${product.slug}`}>
                <View className="size-4" /> View in 3D / AR
              </Link>
            </Button>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-leather-600">{product.category?.name}</p>
          <h1 className="mt-1 font-display text-3xl">{product.name}</h1>
          <p className="mt-1 text-sm text-ink/60">SKU: {product.sku}</p>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-display text-2xl text-leather-700">{rupeesOnly(product.basePrice)}</span>
            {product.mrp && product.mrp > product.basePrice && (
              <span className="text-sm text-ink/50 line-through">{inr(product.mrp)}</span>
            )}
            <span className="text-xs text-ink/60">incl. GST</span>
          </div>

          {product.shortDescription && (
            <p className="mt-4 text-ink/80">{product.shortDescription}</p>
          )}

          <div className="mt-6">
            <AddToCart variants={product.variants.map((v) => ({
              id: v.id,
              size: v.size,
              color: v.color,
              price: v.priceOverride ?? product.basePrice,
            }))} basePrice={product.basePrice} />
          </div>

          {product.description && (
            <div className="mt-8 prose prose-sm max-w-none text-ink/80 whitespace-pre-wrap">
              {product.description}
            </div>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink/60">HSN Code</dt>
            <dd>{product.hsnCode}</dd>
            {meta.material && (
              <>
                <dt className="text-ink/60">Material</dt>
                <dd>{meta.material}</dd>
              </>
            )}
            {meta.warrantyMonths && (
              <>
                <dt className="text-ink/60">Warranty</dt>
                <dd>{meta.warrantyMonths} months</dd>
              </>
            )}
          </dl>

          <section aria-labelledby="declarations" className="mt-8 rounded-md border border-leather-100 p-4">
            <h2 id="declarations" className="text-xs uppercase tracking-[0.2em] text-ink/60">Product declarations</h2>
            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5 text-sm">
              {declarations.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink/60">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
