import { z } from "zod";

/** The three product lines we sell in v1. */
export const ProductType = z.enum(["tshirt", "mug", "cap"]);
export type ProductType = z.infer<typeof ProductType>;

/** A buyable variant of a product (a specific color/size with its own SKU + Stripe price). */
export const Variant = z.object({
  id: z.string(),
  productId: z.string(),
  color: z.string(),
  /** Mugs and caps may be one-size; t-shirts use S–XXL. */
  size: z.string().nullable().default(null),
  sku: z.string(),
  /** Added to the product base price (can be 0). */
  priceDeltaCents: z.number().int().default(0),
  /** Stripe price id once mirrored via `insforge payments`. */
  stripePriceId: z.string().nullable().default(null),
  /** Printful catalog variant id once this SKU is mapped for real fulfillment. */
  printfulVariantId: z.number().int().nullable().default(null),
});
export type Variant = z.infer<typeof Variant>;

export const Product = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: ProductType,
  description: z.string().default(""),
  basePriceCents: z.number().int().nonnegative(),
  active: z.boolean().default(true),
  variants: z.array(Variant).default([]),
});
export type Product = z.infer<typeof Product>;
