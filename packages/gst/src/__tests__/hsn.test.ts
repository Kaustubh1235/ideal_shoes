import { describe, it, expect } from "vitest";
import { defaultRateFor, splitInclusive } from "../hsn";

describe("GST slabs from 22 Sep 2025", () => {
  it("footwear is 5% up to ₹2500 a pair and 18% above", () => {
    expect(defaultRateFor("6403", 1999)).toBe(0.05);
    expect(defaultRateFor("640391", 2500)).toBe(0.05);
    expect(defaultRateFor("6403", 2501)).toBe(0.18);
  });
  it("jackets follow the same ₹2500 threshold", () => {
    expect(defaultRateFor("6201", 2400)).toBe(0.05);
    expect(defaultRateFor("6201", 4000)).toBe(0.18);
  });
});

describe("splitInclusive", () => {
  it("takes GST out of the shown price instead of adding it", () => {
    const r = splitInclusive(209900, 2, "6403"); // ₹2,099 incl. GST, 2 pairs
    expect(r.gstRate).toBe(0.05);
    expect(r.taxableValue + r.tax).toBe(419800);
    expect(r.taxableValue).toBe(Math.round(419800 / 1.05));
  });
  it("uses 18% when the value without tax is above ₹2500", () => {
    const r = splitInclusive(349900, 1, "6403");
    expect(r.gstRate).toBe(0.18);
    expect(r.taxableValue).toBe(Math.round(349900 / 1.18));
  });
  it("falls back to 18% for HSNs without a rule (bags, belts)", () => {
    expect(splitInclusive(150000, 1, "4202").gstRate).toBe(0.18);
  });
});
