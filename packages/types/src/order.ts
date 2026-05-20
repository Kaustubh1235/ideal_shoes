import { z } from "zod";
import { AddressInput } from "./address";
import { OrderChannel } from "./enums";

export const CartItemInput = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});
export type CartItemInput = z.infer<typeof CartItemInput>;

export const CheckoutInput = z.object({
  cartId: z.string().uuid(),
  billingAddress: AddressInput,
  shippingAddress: AddressInput,
  channel: OrderChannel.default("d2c"),
  buyerGstin: z.string().optional(),
  notes: z.string().max(500).optional(),
  couponCode: z.string().optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;
