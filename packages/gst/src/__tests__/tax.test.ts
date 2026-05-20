import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, computeLineTax, amountInWords, isInterState } from "../tax";

describe("computeLineTax", () => {
  it("same-state splits CGST/SGST 50/50", () => {
    const r = computeLineTax(
      { unitPrice: 1000, quantity: 2, hsnCode: "6403", gstRate: 0.18 },
      false,
    );
    expect(r.taxableValue).toBe(2000);
    expect(r.cgst).toBe(180);
    expect(r.sgst).toBe(180);
    expect(r.igst).toBe(0);
    expect(r.lineTotal).toBe(2360);
  });

  it("inter-state uses IGST only", () => {
    const r = computeLineTax(
      { unitPrice: 1000, quantity: 2, hsnCode: "6403", gstRate: 0.18 },
      true,
    );
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.igst).toBe(360);
    expect(r.lineTotal).toBe(2360);
  });

  it("EXEMPT treatment skips tax", () => {
    const r = computeLineTax(
      { unitPrice: 1000, quantity: 1, hsnCode: "6403", gstRate: 0.18, treatment: "EXEMPT" },
      true,
    );
    expect(r.igst).toBe(0);
    expect(r.lineTotal).toBe(1000);
  });

  it("applies line discount before tax", () => {
    const r = computeLineTax(
      { unitPrice: 1000, quantity: 1, hsnCode: "6403", gstRate: 0.18, discount: 100 },
      false,
    );
    expect(r.taxableValue).toBe(900);
    expect(r.cgst).toBe(81);
    expect(r.sgst).toBe(81);
  });
});

describe("computeInvoiceTotals", () => {
  it("rolls up totals and rounds off", () => {
    const { totals } = computeInvoiceTotals(
      [
        { unitPrice: 999, quantity: 1, hsnCode: "6403", gstRate: 0.12 },
        { unitPrice: 1500, quantity: 2, hsnCode: "6403", gstRate: 0.18 },
      ],
      false,
    );
    expect(totals.taxableValue).toBe(3999);
    expect(totals.cgstTotal + totals.sgstTotal).toBeGreaterThan(0);
    expect(Number.isInteger(totals.grandTotal)).toBe(true);
  });
});

describe("isInterState", () => {
  it("compares state codes", () => {
    expect(isInterState("27", "07")).toBe(true);
    expect(isInterState("27", "27")).toBe(false);
  });
});

describe("amountInWords", () => {
  it("handles zero", () => {
    expect(amountInWords(0)).toBe("Zero Rupees Only");
  });
  it("handles small amounts with paise", () => {
    expect(amountInWords(123.45)).toBe(
      "One Hundred Twenty Three Rupees and Forty Five Paise Only",
    );
  });
  it("handles Indian numbering (lakh, crore)", () => {
    expect(amountInWords(150000)).toContain("Lakh");
    expect(amountInWords(15000000)).toContain("Crore");
  });
});
