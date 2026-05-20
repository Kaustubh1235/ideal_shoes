// Display-side helpers only. The authoritative tax engine is in apps/api/app/services/tax/engine.py.
// This file mirrors its outputs so the storefront/admin can preview totals without an API round-trip.

export type TaxTreatment = "TAXABLE" | "EXEMPT" | "NIL_RATED" | "ZERO_RATED" | "NON_GST";

export interface LineInput {
  unitPrice: number;
  quantity: number;
  hsnCode: string;
  gstRate: number; // decimal, e.g., 0.18
  treatment?: TaxTreatment; // default TAXABLE
  discount?: number; // absolute amount on the line
}

export interface LineTax {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  lineTotal: number;
}

export interface InvoiceTotals {
  subtotal: number;
  totalDiscount: number;
  taxableValue: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  cessTotal: number;
  roundOff: number;
  grandTotal: number;
}

export function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLineTax(line: LineInput, isInterState: boolean): LineTax {
  const treatment = line.treatment ?? "TAXABLE";
  const gross = line.unitPrice * line.quantity;
  const discount = line.discount ?? 0;
  const taxableValue = roundCurrency(gross - discount);

  if (treatment !== "TAXABLE") {
    return {
      taxableValue,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      lineTotal: taxableValue,
    };
  }

  const totalTax = roundCurrency(taxableValue * line.gstRate);
  let cgst = 0,
    sgst = 0,
    igst = 0;
  if (isInterState) {
    igst = totalTax;
  } else {
    cgst = roundCurrency(totalTax / 2);
    sgst = roundCurrency(totalTax - cgst);
  }

  return {
    taxableValue,
    cgst,
    sgst,
    igst,
    cess: 0,
    lineTotal: roundCurrency(taxableValue + cgst + sgst + igst),
  };
}

export function computeInvoiceTotals(
  lines: LineInput[],
  isInterState: boolean,
): { lines: LineTax[]; totals: InvoiceTotals } {
  const computed = lines.map((l) => computeLineTax(l, isInterState));
  const subtotal = roundCurrency(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const totalDiscount = roundCurrency(lines.reduce((s, l) => s + (l.discount ?? 0), 0));
  const taxableValue = roundCurrency(computed.reduce((s, l) => s + l.taxableValue, 0));
  const cgstTotal = roundCurrency(computed.reduce((s, l) => s + l.cgst, 0));
  const sgstTotal = roundCurrency(computed.reduce((s, l) => s + l.sgst, 0));
  const igstTotal = roundCurrency(computed.reduce((s, l) => s + l.igst, 0));
  const cessTotal = roundCurrency(computed.reduce((s, l) => s + l.cess, 0));
  const preRound = taxableValue + cgstTotal + sgstTotal + igstTotal + cessTotal;
  const grandTotal = Math.round(preRound);
  const roundOff = roundCurrency(grandTotal - preRound);

  return {
    lines: computed,
    totals: {
      subtotal,
      totalDiscount,
      taxableValue,
      cgstTotal,
      sgstTotal,
      igstTotal,
      cessTotal,
      roundOff,
      grandTotal,
    },
  };
}

export function isInterState(buyerStateCode: string, sellerStateCode: string): boolean {
  return buyerStateCode !== sellerStateCode;
}

// Number to words (Indian numbering system) for invoice "amount in words"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = [
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n === 0) return "";
  if (n < 10) return ONES[n]!;
  if (n < 20) return TEENS[n - 10]!;
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  const tail = twoDigits(r);
  if (tail) parts.push(tail);
  return parts.join(" ");
}

export function amountInWords(amount: number, currency = "Rupees"): string {
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  if (rupees === 0 && paise === 0) return `Zero ${currency} Only`;

  let rupeesPart = "";
  let r = rupees;
  if (r >= 10000000) {
    rupeesPart += twoDigits(Math.floor(r / 10000000)) + " Crore ";
    r %= 10000000;
  }
  if (r >= 100000) {
    rupeesPart += twoDigits(Math.floor(r / 100000)) + " Lakh ";
    r %= 100000;
  }
  if (r >= 1000) {
    rupeesPart += twoDigits(Math.floor(r / 1000)) + " Thousand ";
    r %= 1000;
  }
  if (r > 0) {
    rupeesPart += threeDigits(r);
  }
  rupeesPart = rupeesPart.trim();

  let result = rupees > 0 ? `${rupeesPart} ${currency}` : "";
  if (paise > 0) {
    result += (result ? " and " : "") + twoDigits(paise) + " Paise";
  }
  return result + " Only";
}
