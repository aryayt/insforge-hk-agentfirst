import { z } from "zod";

/**
 * Widget prop schemas — these mirror the DEPLOYED MCP server's data shapes
 * (apps/mcp/src: @app/shared Product/Variant + the in-memory session cart in
 * session.ts). The discrete widgets validate against these; if the server's
 * returned shape changes, update it here in the same change.
 */

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  color: z.string(),
  size: z.string().nullable(),
  sku: z.string(),
  priceDeltaCents: z.number().int(),
  stripePriceId: z.string().nullable(),
  // Present on the deployed Variant type; widgets don't render it but accept it.
  printfulVariantId: z.number().nullable().optional(),
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
  imageUrl: z.string(),
  prompt: z.string().optional(),
  imageKey: z.string().optional(),
  createdAt: z.number().optional(),
});

/** Matches SessionCartItem in apps/mcp/src/session.ts (flat per-session cart). */
export const sessionCartItemSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productLabel: z.string(),
  stripePriceId: z.string().nullable(),
  designId: z.string().optional(),
  designLabel: z.string().optional(),
  designUrl: z.string().optional(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

/** Brand signals extracted by the analyze_brand tool. */
export const brandSchema = z.object({
  name: z.string(),
  domain: z.string().optional(),
  colors: z.array(z.string()),
  logoUrl: z.string().nullable().optional(),
});
