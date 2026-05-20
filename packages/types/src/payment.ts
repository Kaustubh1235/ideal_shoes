import { z } from "zod";

export const RazorpayCreateOrderInput = z.object({
  orderId: z.string().uuid(),
});
export type RazorpayCreateOrderInput = z.infer<typeof RazorpayCreateOrderInput>;

export const RazorpayCreateOrderOutput = z.object({
  razorpayOrderId: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  keyId: z.string(),
  prefill: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    contact: z.string().optional(),
  }),
});
export type RazorpayCreateOrderOutput = z.infer<typeof RazorpayCreateOrderOutput>;

export const RazorpayClientCallback = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});
export type RazorpayClientCallback = z.infer<typeof RazorpayClientCallback>;
