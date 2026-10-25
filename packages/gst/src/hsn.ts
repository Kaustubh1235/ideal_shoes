// HSN code helpers and common footwear/apparel HSN -> default GST rate map.
// Rates per CBIC Notification 1/2017-CT (Rate) as amended by Notification 9/2025-CT (Rate),
// in force from 22 Sep 2025 (56th GST Council): the 12% slab is gone.
// Footwear: HSN 6401-6405 -> 5% (sale value ≤ ₹2500 per pair) or 18% (above).
// Jackets / apparel: HSN 61xx, 62xx -> 5% (≤ ₹2500 per piece) or 18% (above).
// The threshold is on the sale value per unit, i.e. excluding GST.

export interface HsnRateRule {
  hsn: string;
  description: string;
  // Function: given selling price per unit, returns GST rate as decimal (e.g., 0.12)
  rateFor: (unitPriceInr: number) => number;
}

export const FOOTWEAR_HSN_RULES: HsnRateRule[] = [
  {
    hsn: "6401",
    description: "Waterproof footwear with outer soles and uppers of rubber or plastics",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
  {
    hsn: "6402",
    description: "Other footwear with outer soles and uppers of rubber or plastics",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
  {
    hsn: "6403",
    description: "Footwear with outer soles of rubber/plastics/leather and uppers of leather",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
  {
    hsn: "6404",
    description: "Footwear with outer soles of rubber/plastics/leather and uppers of textile materials",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
  {
    hsn: "6405",
    description: "Other footwear (including parts)",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
];

export const APPAREL_HSN_RULES: HsnRateRule[] = [
  {
    hsn: "6101",
    description: "Men's overcoats, jackets, blazers etc. - knitted/crocheted",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
  {
    hsn: "6201",
    description: "Men's overcoats, jackets etc. - not knitted/crocheted",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
  {
    hsn: "6202",
    description: "Women's overcoats, jackets etc. - not knitted/crocheted",
    rateFor: (p) => (p <= 2500 ? 0.05 : 0.18),
  },
];

export const HSN_RULES: HsnRateRule[] = [...FOOTWEAR_HSN_RULES, ...APPAREL_HSN_RULES];

export function defaultRateFor(hsn: string, unitPriceInr: number): number | null {
  const rule = HSN_RULES.find((r) => hsn.startsWith(r.hsn));
  if (!rule) return null;
  return rule.rateFor(unitPriceInr);
}

const HSN_FORMAT = /^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/;

/** GST rate when an HSN has no rule here (e.g. bags 4202, belts 4203). Confirm those with the CA and add rules. */
export const FALLBACK_GST_RATE = 0.18;

export interface InclusiveSplit {
  gstRate: number;
  taxableValue: number; // paise
  tax: number; // paise
}

/**
 * Split a GST-inclusive line amount (what the storefront shows as "incl. GST") into taxable
 * value and tax. The slab is chosen on the per-unit sale value excluding tax: try the low slab
 * first and move up only if the value without tax is above the threshold.
 */
export function splitInclusive(unitPricePaise: number, quantity: number, hsn: string): InclusiveSplit {
  const rule = HSN_RULES.find((r) => hsn.startsWith(r.hsn));
  let gstRate = FALLBACK_GST_RATE;
  if (rule) {
    const low = rule.rateFor(0);
    gstRate = rule.rateFor(unitPricePaise / (1 + low) / 100);
  }
  const gross = unitPricePaise * quantity;
  const taxableValue = Math.round(gross / (1 + gstRate));
  return { gstRate, taxableValue, tax: gross - taxableValue };
}

export function isValidHsn(hsn: string): boolean {
  return typeof hsn === "string" && HSN_FORMAT.test(hsn);
}
