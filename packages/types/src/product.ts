import { z } from "zod";
import { TaxTreatment } from "./enums";

export const ProductCategory = z.enum(["army_boots", "oxford_shoes", "jackets", "accessories"]);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const ProductInput = z.object({
  sku: z.string().min(2).max(40),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(160),
  shortDescription: z.string().max(300).optional(),
  description: z.string().optional(),
  category: ProductCategory,
  hsnCode: z.string().regex(/^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/),
  taxTreatment: TaxTreatment.default("TAXABLE"),
  basePrice: z.number().int().nonnegative(),
  mrp: z.number().int().nonnegative().optional(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  arEnabled: z.boolean().default(false),
  weightGrams: z.number().int().nonnegative().optional(),
  meta: z
    .object({
      material: z.string().optional(),
      countryOfOrigin: z.string().default("India"),
      warrantyMonths: z.number().int().nonnegative().optional(),
      careInstructions: z.string().optional(),
    })
    .optional(),
});
export type ProductInput = z.infer<typeof ProductInput>;

export const ProductVariantInput = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(2).max(60),
  size: z.string().min(1).max(10),
  color: z.string().min(2).max(40),
  attributes: z.record(z.string()).optional(),
  priceOverride: z.number().int().nonnegative().optional(),
  weightGrams: z.number().int().nonnegative().optional(),
  barcode: z.string().optional(),
});
export type ProductVariantInput = z.infer<typeof ProductVariantInput>;
