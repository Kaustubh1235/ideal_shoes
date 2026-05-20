import { z } from "zod";
import { DealerGstScheme, DealerStatus } from "./enums";

export const DealerApplicationInput = z.object({
  businessName: z.string().min(2).max(160),
  contactName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  gstScheme: DealerGstScheme.default("regular"),
  billingAddress: z.object({
    line1: z.string().min(3),
    line2: z.string().optional(),
    city: z.string().min(2),
    state: z.string().min(2),
    stateCode: z.string().regex(/^[0-9]{2}$/),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/),
  }),
  yearsInBusiness: z.number().int().min(0).optional(),
  estimatedMonthlyOrderValue: z.number().int().nonnegative().optional(),
});
export type DealerApplicationInput = z.infer<typeof DealerApplicationInput>;

export const DealerProfileDto = z.object({
  id: z.string().uuid(),
  businessName: z.string(),
  status: DealerStatus,
  gstin: z.string(),
  priceTier: z.string(),
  creditLimit: z.number().int(),
  creditUsed: z.number().int(),
  approvedAt: z.string().optional(),
});
