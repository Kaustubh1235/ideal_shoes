import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, View } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { rupeesOnly, inr } from "@/lib/money";
import { Button } from "@bharatboot/ui";
import { AddToCart } from "@/components/storefront/add-to-cart";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      variants: { where: { isActive: true }, orderBy: { size: "asc" } },
      category: true,
    },
  });
  if (!product) notFound();

  return (
    <div className="container py-8">
      <nav className="text-xs text-ink/60 flex items-center gap-1 mb-4">
        <Link href="/" className="hover:text-olive-700">Home</Link>
        <ChevronRight className="size-3" />
        <Link href="/products" className="hover:text-olive-700">Products</Link>
        {product.category && (
          <>
            <ChevronRight className="size-3" />
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-olive-700">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3" />
        <span className="text-ink/80">{product.name}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="aspect-square bg-olive-50 rounded-md overflow-hidden border border-olive-100">
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
                <img key={img.id} src={img.url} alt={img.alt ?? ""} className="aspect-square w-full rounded object-cover border border-olive-100" />
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
          <p className="text-xs uppercase tracking-[0.2em] text-olive-600">{product.category?.name}</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-wide">{product.name}</h1>
          <p className="mt-1 text-sm text-ink/60">SKU: {product.sku}</p>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-display text-2xl text-olive-700">{rupeesOnly(product.basePrice)}</span>
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
            <dt className="text-ink/60">Country of Origin</dt>
            <dd>{(product.metaJson as any)?.countryOfOrigin ?? "India"}</dd>
            {(product.metaJson as any)?.material && (
              <>
                <dt className="text-ink/60">Material</dt>
                <dd>{(product.metaJson as any).material}</dd>
              </>
            )}
            {(product.metaJson as any)?.warrantyMonths && (
              <>
                <dt className="text-ink/60">Warranty</dt>
                <dd>{(product.metaJson as any).warrantyMonths} months</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
