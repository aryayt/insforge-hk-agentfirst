import { z } from "zod";

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  color: z.string(),
  size: z.string().nullable(),
  sku: z.string(),
  priceDeltaCents: z.number().int(),
  stripePriceId: z.string().nullable(),
});

export const productSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.enum(["tshirt", "mug", "cap"]),
  description: z.string(),
  basePriceCents: z.number().int().nonnegative(),
  active: z.boolean(),
  variants: z.array(variantSchema),
});

export const designSchema = z.object({
  id: z.string(),
  label: z.string(),
  imageUrl: z.string().url(),
  imageKey: z.string().optional(),
});

export const cartLineSchema = z.object({
  sku: z.string(),
  label: z.string(),
  designId: z.string().nullable(),
  designLabel: z.string().nullable(),
  designPreviewUrl: z.string().nullable(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  stripePriceId: z.string().nullable(),
});

export const sessionCartSchema = z.object({
  id: z.string(),
  lines: z.array(cartLineSchema),
});
