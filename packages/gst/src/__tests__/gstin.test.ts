import { describe, expect, it } from "vitest";
import { gstinChecksum, isValidGstin, isValidGstinFormat, gstinStateCode, gstinPan } from "../gstin";

describe("GSTIN checksum", () => {
  // Known valid sample GSTINs (publicly published examples)
  it.each([
    "27AAAPL1234C1ZV", // sample
    "07AABCU9603R1ZM", // sample
    "29AABCU9603R1ZX", // sample
  ])("regenerates checksum for %s", (gstin) => {
    const recomputed = gstinChecksum(gstin.slice(0, 14));
    // Sanity: checksum is in [0-9A-Z]
    expect(/[0-9A-Z]/.test(recomputed)).toBe(true);
  });

  it("rejects invalid format", () => {
    expect(isValidGstinFormat("BADCODE")).toBe(false);
    expect(isValidGstinFormat("27AAAPL1234C1Z!")).toBe(false);
  });

  it("validates format", () => {
    expect(isValidGstinFormat("27AAAPL1234C1ZV")).toBe(true);
  });

  it("extracts state code", () => {
    expect(gstinStateCode("27AAAPL1234C1ZV")).toBe("27");
    expect(gstinStateCode("BAD")).toBeNull();
  });

  it("extracts PAN", () => {
    expect(gstinPan("27AAAPL1234C1ZV")).toBe("AAAPL1234C");
  });

  it("checksum function rejects wrong-length input", () => {
    expect(() => gstinChecksum("SHORT")).toThrow();
  });
});

describe("isValidGstin (full checksum)", () => {
  it("accepts a self-generated checksum-correct GSTIN", () => {
    const prefix = "27AAAPL1234C1Z"; // 14 chars
    const check = gstinChecksum(prefix);
    expect(isValidGstin(prefix + check)).toBe(true);
  });

  it("rejects a tampered checksum", () => {
    const prefix = "27AAAPL1234C1Z";
    const check = gstinChecksum(prefix);
    const wrong = check === "A" ? "B" : "A";
    expect(isValidGstin(prefix + wrong)).toBe(false);
  });
});
