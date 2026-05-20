// HSN code helpers and common footwear/apparel HSN -> default GST rate map.
// Rates per CBIC Notification 1/2017-CT (Rate) and subsequent amendments.
// Footwear: HSN 6401-6405 -> 12% (≤₹1000) or 18% (>₹1000) -- value-based slabs.
// Jackets / apparel: HSN 6101-6117, 6201-6217 -> 5% (≤₹1000) or 12% (>₹1000).

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
    rateFor: (p) => (p <= 1000 ? 0.12 : 0.18),
  },
  {
    hsn: "6402",
    description: "Other footwear with outer soles and uppers of rubber or plastics",
    rateFor: (p) => (p <= 1000 ? 0.12 : 0.18),
  },
  {
    hsn: "6403",
    description: "Footwear with outer soles of rubber/plastics/leather and uppers of leather",
    rateFor: (p) => (p <= 1000 ? 0.12 : 0.18),
  },
  {
    hsn: "6404",
    description: "Footwear with outer soles of rubber/plastics/leather and uppers of textile materials",
    rateFor: (p) => (p <= 1000 ? 0.12 : 0.18),
  },
  {
    hsn: "6405",
    description: "Other footwear (including parts)",
    rateFor: (p) => (p <= 1000 ? 0.12 : 0.18),
  },
];

export const APPAREL_HSN_RULES: HsnRateRule[] = [
  {
    hsn: "6101",
    description: "Men's overcoats, jackets, blazers etc. - knitted/crocheted",
    rateFor: (p) => (p <= 1000 ? 0.05 : 0.12),
  },
  {
    hsn: "6201",
    description: "Men's overcoats, jackets etc. - not knitted/crocheted",
    rateFor: (p) => (p <= 1000 ? 0.05 : 0.12),
  },
  {
    hsn: "6202",
    description: "Women's overcoats, jackets etc. - not knitted/crocheted",
    rateFor: (p) => (p <= 1000 ? 0.05 : 0.12),
  },
];

export const HSN_RULES: HsnRateRule[] = [...FOOTWEAR_HSN_RULES, ...APPAREL_HSN_RULES];

export function defaultRateFor(hsn: string, unitPriceInr: number): number | null {
  const rule = HSN_RULES.find((r) => hsn.startsWith(r.hsn));
  if (!rule) return null;
  return rule.rateFor(unitPriceInr);
}

const HSN_FORMAT = /^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/;

export function isValidHsn(hsn: string): boolean {
  return typeof hsn === "string" && HSN_FORMAT.test(hsn);
}
