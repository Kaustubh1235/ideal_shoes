import { z } from "zod";

export const UserType = z.enum(["customer", "dealer", "staff"]);
export type UserType = z.infer<typeof UserType>;

export const StaffRole = z.enum(["super_admin", "admin", "ops", "finance", "support"]);
export type StaffRole = z.infer<typeof StaffRole>;

export const OrderChannel = z.enum(["d2c", "wholesale", "manual", "tender"]);
export type OrderChannel = z.infer<typeof OrderChannel>;

export const OrderStatus = z.enum([
  "draft",
  "pending_payment",
  "paid",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const PaymentStatus = z.enum([
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "partially_refunded",
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const TaxTreatment = z.enum(["TAXABLE", "EXEMPT", "NIL_RATED", "ZERO_RATED", "NON_GST"]);
export type TaxTreatment = z.infer<typeof TaxTreatment>;

export const DealerStatus = z.enum(["pending", "approved", "suspended", "rejected"]);
export type DealerStatus = z.infer<typeof DealerStatus>;

export const DealerGstScheme = z.enum(["regular", "composition", "unregistered"]);
export type DealerGstScheme = z.infer<typeof DealerGstScheme>;

export const TenderSource = z.enum([
  "manual",
  "rss_cppp",
  "email",
  "aggregator_bidassist",
  "aggregator_tendersinfo",
]);
export type TenderSource = z.infer<typeof TenderSource>;

export const TenderStatus = z.enum([
  "new",
  "watching",
  "preparing_bid",
  "submitted",
  "won",
  "lost",
  "withdrawn",
  "expired",
]);
export type TenderStatus = z.infer<typeof TenderStatus>;

export const StockMovementReason = z.enum([
  "purchase",
  "sale",
  "return",
  "adjustment",
  "transfer_in",
  "transfer_out",
  "production",
  "damage",
  "reserve",
  "release",
]);
export type StockMovementReason = z.infer<typeof StockMovementReason>;
