import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOrCreateCartId, getCart } from "@/lib/cart";
import { prisma } from "@/lib/prisma";
import { inr } from "@/lib/money";
import { Button, Input, Label } from "@bharatboot/ui";
import { placeOrderAction } from "@/app/actions/checkout";
import { GST_STATE_CODES } from "@bharatboot/gst";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cartId = await getOrCreateCartId();
  const items = await getCart(cartId);
  if (items.length === 0) redirect("/cart");

  const session = await auth();
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines = items
    .map((i) => {
      const v = byId.get(i.variantId);
      if (!v) return null;
      const price = v.priceOverride ?? v.product.basePrice;
      return { name: v.product.name, size: v.size, qty: i.quantity, lineTotal: price * i.quantity };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <div className="container py-8 grid gap-8 md:grid-cols-3">
      <form action={placeOrderAction} className="md:col-span-2 space-y-6">
        <section className="rounded-lg border border-leather-100 bg-cream p-6">
          <h2 className="font-display text-lg">Contact</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={session?.user?.email ?? ""} required />
            </div>
          </div>
        </section>

        <AddressBlock title="Shipping Address" prefix="shipping" />
        <AddressBlock title="Billing Address" prefix="billing" />

        <section className="rounded-lg border border-leather-100 bg-cream p-6">
          <h2 className="font-display text-lg">GST Details (optional)</h2>
          <p className="text-xs text-ink/60 mt-1">Provide GSTIN if buying as a business — required for input tax credit.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="buyerLegalName">Legal Name</Label>
              <Input id="buyerLegalName" name="buyerLegalName" />
            </div>
            <div>
              <Label htmlFor="buyerGstin">GSTIN</Label>
              <Input id="buyerGstin" name="buyerGstin" pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}" />
            </div>
          </div>
        </section>

        <Button type="submit" size="lg" className="w-full">Place Order &amp; Pay {inr(subtotal)}</Button>
      </form>

      <aside className="rounded-lg border border-leather-100 bg-cream p-6 h-fit sticky top-24">
        <h2 className="font-display text-lg">Order Review</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-ink/80">{l.name} <span className="text-ink/50">× {l.qty}</span></span>
              <span>{inr(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-4 border-t flex justify-between font-medium">
          <span>Total (incl. GST)</span>
          <span>{inr(subtotal)}</span>
        </div>
        <p className="mt-2 text-xs text-ink/60">
          Prices include GST. Your tax invoice shows CGST/SGST or IGST based on the delivery state.
        </p>
      </aside>
    </div>
  );
}

function AddressBlock({ title, prefix }: { title: string; prefix: string }) {
  return (
    <section className="rounded-lg border border-leather-100 bg-cream p-6">
      <h2 className="font-display text-lg">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor={`${prefix}.fullName`}>Full Name</Label>
          <Input id={`${prefix}.fullName`} name={`${prefix}.fullName`} required />
        </div>
        <div>
          <Label htmlFor={`${prefix}.phone`}>Phone</Label>
          <Input id={`${prefix}.phone`} name={`${prefix}.phone`} pattern="[6-9][0-9]{9}" required />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={`${prefix}.line1`}>Address Line 1</Label>
          <Input id={`${prefix}.line1`} name={`${prefix}.line1`} required />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={`${prefix}.line2`}>Address Line 2</Label>
          <Input id={`${prefix}.line2`} name={`${prefix}.line2`} />
        </div>
        <div>
          <Label htmlFor={`${prefix}.city`}>City</Label>
          <Input id={`${prefix}.city`} name={`${prefix}.city`} required />
        </div>
        <div>
          <Label htmlFor={`${prefix}.pincode`}>Pincode</Label>
          <Input id={`${prefix}.pincode`} name={`${prefix}.pincode`} pattern="[1-9][0-9]{5}" required />
        </div>
        <div>
          <Label htmlFor={`${prefix}.state`}>State</Label>
          <Input id={`${prefix}.state`} name={`${prefix}.state`} required />
        </div>
        <div>
          <Label htmlFor={`${prefix}.stateCode`}>State Code</Label>
          <select
            id={`${prefix}.stateCode`}
            name={`${prefix}.stateCode`}
            required
            className="flex h-10 w-full rounded-md border border-leather-200 bg-cream px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>Choose…</option>
            {Object.entries(GST_STATE_CODES).map(([code, name]) => (
              <option key={code} value={code}>{code} — {name}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
