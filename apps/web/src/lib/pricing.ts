import { prisma } from "@/lib/prisma";
import { defaultRateFor, FALLBACK_GST_RATE, splitInclusive } from "@bharatboot/gst";

/**
 * What one cart line costs. Shoppers pay the shown price, which includes GST. Approved dealers
 * pay their tier price (the best quantity break they qualify for) plus GST, as B2B prices are
 * quoted ex-GST; variants without a tier entry fall back to the retail price incl. GST.
 */
export interface LinePrice {
  unit: number; // paise charged per unit before tax for dealers, incl. tax for shoppers
  gross: number; // paise, incl. GST
  taxable: number;
  tax: number;
  gstRate: number;
  dealerPrice: boolean;
}

type PricedVariant = { id: string; priceOverride: number | null; product: { basePrice: number; hsnCode: string } };

/** The approved dealer's price tier for this user, or null for everyone else. */
export async function dealerTier(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const d = await prisma.dealerProfile.findUnique({ where: { userId }, select: { status: true, priceTier: true } });
  return d?.status === "approved" ? d.priceTier ?? "tier_b" : null;
}

export async function priceLines(
  lines: { variant: PricedVariant; quantity: number }[],
  tier: string | null,
): Promise<LinePrice[]> {
  const entries = tier
    ? await prisma.dealerPriceListEntry.findMany({
        where: { priceList: { tier, isActive: true }, variantId: { in: lines.map((l) => l.variant.id) } },
      })
    : [];
  return lines.map(({ variant, quantity }) => {
    const best = entries
      .filter((e) => e.variantId === variant.id && e.minQuantity <= quantity)
      .sort((a, b) => b.minQuantity - a.minQuantity)[0];
    if (best) {
      const taxable = best.price * quantity;
      const gstRate = defaultRateFor(variant.product.hsnCode, best.price / 100) ?? FALLBACK_GST_RATE;
      const tax = Math.round(taxable * gstRate);
      return { unit: best.price, gross: taxable + tax, taxable, tax, gstRate, dealerPrice: true };
    }
    const unit = variant.priceOverride ?? variant.product.basePrice;
    const s = splitInclusive(unit, quantity, variant.product.hsnCode);
    return { unit, gross: unit * quantity, taxable: s.taxableValue, tax: s.tax, gstRate: s.gstRate, dealerPrice: false };
  });
}
