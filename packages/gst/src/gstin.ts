// GSTIN format: 15 characters
// 2 digits state code | 10 PAN | 1 entity number per PAN | 1 alphabet "Z" | 1 checksum
// Checksum: base-36 mod-36 algorithm.

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function isValidGstinFormat(gstin: string): boolean {
  return typeof gstin === "string" && GSTIN_REGEX.test(gstin);
}

export function gstinChecksum(gstin14: string): string {
  if (gstin14.length !== 14) {
    throw new Error("gstinChecksum: expected 14-character input (no check digit)");
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const ch = gstin14[i]!;
    const value = CHARSET.indexOf(ch);
    if (value < 0) throw new Error(`gstinChecksum: invalid character "${ch}" at index ${i}`);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    const hashed = Math.floor(product / 36) + (product % 36);
    sum += hashed;
  }
  const remainder = sum % 36;
  const checkValue = (36 - remainder) % 36;
  return CHARSET[checkValue]!;
}

export function isValidGstin(gstin: string): boolean {
  if (!isValidGstinFormat(gstin)) return false;
  const expected = gstinChecksum(gstin.slice(0, 14));
  return expected === gstin[14];
}

export function gstinStateCode(gstin: string): string | null {
  if (!isValidGstinFormat(gstin)) return null;
  return gstin.slice(0, 2);
}

export function gstinPan(gstin: string): string | null {
  if (!isValidGstinFormat(gstin)) return null;
  return gstin.slice(2, 12);
}
