import { z } from "zod";

export const AddressInput = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9][0-9]{9}$/, "Enter 10-digit Indian mobile"),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  stateCode: z.string().regex(/^[0-9]{2}$/, "2-digit GST state code"),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "6-digit Indian pincode"),
  country: z.string().default("India"),
  landmark: z.string().max(120).optional().or(z.literal("")),
  type: z.enum(["billing", "shipping", "both"]).default("both"),
});
export type AddressInput = z.infer<typeof AddressInput>;
