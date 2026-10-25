"use server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCartId, getCart, clearCart } from "@/lib/cart";
import { dealerTier, priceLines } from "@/lib/pricing";

const AddrSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  stateCode: z.string().regex(/^[0-9]{2}$/),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/),
});

const CheckoutInput = z.object({
  email: z.string().email().optional(),
  buyerGstin: z.string().optional(),
  buyerLegalName: z.string().optional(),
  billing: AddrSchema,
  shipping: AddrSchema,
});

const SELLER_STATE_CODE = process.env.SELLER_STATE_CODE ?? "09";

export async function placeOrderAction(formData: FormData) {
  const parsed = CheckoutInput.parse({
    email: formData.get("email") || undefined,
    buyerGstin: formData.get("buyerGstin") || undefined,
    buyerLegalName: formData.get("buyerLegalName") || undefined,
    billing: {
      fullName: formData.get("billing.fullName"),
      phone: formData.get("billing.phone"),
      line1: formData.get("billing.line1"),
      line2: formData.get("billing.line2") || undefined,
      city: formData.get("billing.city"),
      state: formData.get("billing.state"),
      stateCode: formData.get("billing.stateCode"),
      pincode: formData.get("billing.pincode"),
    },
    shipping: {
      fullName: formData.get("shipping.fullName"),
      phone: formData.get("shipping.phone"),
      line1: formData.get("shipping.line1"),
      line2: formData.get("shipping.line2") || undefined,
      city: formData.get("shipping.city"),
      state: formData.get("shipping.state"),
      stateCode: formData.get("shipping.stateCode"),
      pincode: formData.get("shipping.pincode"),
    },
  });

  const cartId = await getOrCreateCartId();
  const items = await getCart(cartId);
  if (items.length === 0) throw new Error("Cart is empty");

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const session = await auth();

  const placeOfSupply = parsed.shipping.stateCode;
  const isInterState = placeOfSupply !== SELLER_STATE_CODE;

  let subtotal = 0;
  let cgst_total = 0;
  let sgst_total = 0;
  let igst_total = 0;
  let taxable_value = 0;

  const lines: any[] = [];

  const tier = await dealerTier(session?.user?.id);
  const priced = items
    .map((it) => ({ it, v: byId.get(it.variantId) }))
    .filter((x): x is { it: (typeof items)[number]; v: NonNullable<typeof x.v> } => !!x.v && x.v.isActive && x.v.product.status === "active");
  if (priced.length === 0) throw new Error("Cart is empty");
  const prices = await priceLines(priced.map(({ it, v }) => ({ variant: v, quantity: it.quantity })), tier);

  for (const [i, { it, v }] of priced.entries()) {
    const p = prices[i]!;
    const unit = p.unit;
    const lineGross = p.gross;
    const { gstRate, taxable: lineTaxable, tax: totalTax } = p;
    subtotal += lineTaxable; // pre-tax, so subtotal + GST + round-off = grand total
    taxable_value += lineTaxable;
    let cgst = 0, sgst = 0, igst = 0;
    if (isInterState) {
      igst = totalTax;
    } else {
      cgst = Math.floor(totalTax / 2);
      sgst = totalTax - cgst;
    }
    cgst_total += cgst;
    sgst_total += sgst;
    igst_total += igst;

    lines.push({
      sku: v.sku,
      name: `${v.product.name} — UK ${v.size} / ${v.color}`,
      hsn_code: v.product.hsnCode,
      quantity: it.quantity,
      unit_price: unit,
      discount: 0,
      taxable_value: lineTaxable,
      gst_rate: gstRate,
      cgst,
      sgst,
      igst,
      line_total: lineGross,
      variant_id: v.id,
    });
  }

  const preRound = taxable_value + cgst_total + sgst_total + igst_total;
  const grand_total = Math.round(preRound / 100) * 100;
  const round_off = grand_total - preRound;

  const orderNo = `IDX-${new Date().getFullYear().toString().slice(-2)}-${nanoid(8).toUpperCase()}`;

  const order = await prisma.$transaction(async (tx) => {
    const billing = await tx.address.create({
      data: {
        userId: session?.user?.id ?? null,
        fullName: parsed.billing.fullName,
        phone: parsed.billing.phone,
        line1: parsed.billing.line1,
        line2: parsed.billing.line2 ?? null,
        city: parsed.billing.city,
        state: parsed.billing.state,
        stateCode: parsed.billing.stateCode,
        pincode: parsed.billing.pincode,
        type: "billing",
      },
    });
    const shipping = await tx.address.create({
      data: {
        userId: session?.user?.id ?? null,
        fullName: parsed.shipping.fullName,
        phone: parsed.shipping.phone,
        line1: parsed.shipping.line1,
        line2: parsed.shipping.line2 ?? null,
        city: parsed.shipping.city,
        state: parsed.shipping.state,
        stateCode: parsed.shipping.stateCode,
        pincode: parsed.shipping.pincode,
        type: "shipping",
      },
    });

    const ord = await tx.order.create({
      data: {
        orderNo,
        userId: session?.user?.id ?? null,
        channel: tier ? "wholesale" : "d2c",
        status: "pending_payment",
        billingAddressId: billing.id,
        shippingAddressId: shipping.id,
        buyerGstin: parsed.buyerGstin ?? null,
        buyerLegalName: parsed.buyerLegalName ?? parsed.billing.fullName,
        contactEmail: parsed.email ?? session?.user?.email ?? null,
        placeOfSupply,
        subtotal,
        taxableValue: taxable_value,
        cgstTotal: cgst_total,
        sgstTotal: sgst_total,
        igstTotal: igst_total,
        cessTotal: 0,
        shippingTotal: 0,
        discountTotal: 0,
        roundOff: round_off,
        grandTotal: grand_total,
        placedAt: new Date(),
        items: {
          create: lines.map((l) => ({
            variantId: l.variant_id,
            sku: l.sku,
            name: l.name,
            hsnCode: l.hsn_code,
            quantity: l.quantity,
            unitPrice: l.unit_price,
            discount: l.discount,
            taxableValue: l.taxable_value,
            gstRate: l.gst_rate,
            cgst: l.cgst,
            sgst: l.sgst,
            igst: l.igst,
            cess: 0,
            lineTotal: l.line_total,
          })),
        },
      },
    });
    return ord;
  });

  await clearCart(cartId);

  redirect(`/checkout/${order.id}/pay`);
}
