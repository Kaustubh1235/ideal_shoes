import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreateCartId, getCart } from "@/lib/cart";
import { inr } from "@/lib/money";
import { splitInclusive } from "@bharatboot/gst";
import { Button, EmptyState } from "@bharatboot/ui";
import { ShoppingCart } from "lucide-react";
import { CartItemRow } from "@/components/storefront/cart-item-row";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cartId = await getOrCreateCartId();
  const items = await getCart(cartId);

  if (items.length === 0) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={<ShoppingCart className="size-12" />}
          title="Your cart is empty"
          description="Add a pair of boots, formal shoes or a jacket to get started."
          action={<Button asChild><Link href="/products">Browse Products</Link></Button>}
        />
      </div>
    );
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: {
      product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines = items
    .map((i) => {
      const v = byId.get(i.variantId);
      if (!v) return null;
      const price = v.priceOverride ?? v.product.basePrice;
      return {
        variantId: v.id,
        productName: v.product.name,
        productSlug: v.product.slug,
        imageUrl: v.product.images[0]?.url ?? null,
        size: v.size,
        color: v.color,
        unitPrice: price,
        quantity: i.quantity,
        lineTotal: price * i.quantity,
        hsnCode: v.product.hsnCode,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  // Shown prices include GST; this is the GST part of them.
  const taxPreview = lines.reduce((s, l) => s + splitInclusive(l.unitPrice, l.quantity, l.hsnCode).tax, 0);
  const total = subtotal;

  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl">Your Cart</h1>

      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          {lines.map((l) => (
            <CartItemRow key={l.variantId} line={l} />
          ))}
        </div>

        <aside className="rounded-lg border border-leather-100 bg-cream p-6 h-fit sticky top-24">
          <h2 className="font-display text-lg">Order Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(subtotal)}</dd></div>
            <div className="flex justify-between text-ink/70"><dt>Includes GST</dt><dd>{inr(taxPreview)}</dd></div>
            <div className="flex justify-between text-ink/70"><dt>Shipping</dt><dd>{subtotal >= 200000 ? "Free" : "Calculated at checkout"}</dd></div>
          </dl>
          <div className="mt-4 pt-4 border-t flex justify-between font-medium">
            <span>Total</span>
            <span>{inr(total)}</span>
          </div>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/checkout">Proceed to Checkout</Link>
          </Button>
          <Link href="/products" className="mt-3 block text-center text-sm text-leather-700 hover:underline">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
