/** The business's own details from the SELLER_* settings, for legal pages and product labels. */
export interface Seller {
  legalName: string;
  tradeName: string;
  gstin: string;
  email: string;
  phone: string;
  address: string;
}

export function seller(): Seller {
  let a: Record<string, string> = {};
  try {
    a = JSON.parse(process.env.SELLER_ADDRESS_JSON || "{}");
  } catch {
    a = {};
  }
  const address = [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ");
  return {
    legalName: process.env.SELLER_LEGAL_NAME || "Ideal Shoes",
    tradeName: process.env.SELLER_TRADE_NAME || "IDEALX",
    gstin: process.env.SELLER_GSTIN || "",
    email: process.env.SELLER_EMAIL || "",
    phone: process.env.SELLER_PHONE || "",
    address: address || "Agra, Uttar Pradesh",
  };
}
