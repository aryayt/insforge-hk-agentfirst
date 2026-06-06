import { z } from "zod";

/** A configured line item: a variant, optionally with a design, at a quantity. */
export const CartItem = z.object({
  id: z.string(),
  cartId: z.string(),
  variantId: z.string(),
  designId: z.string().nullable().default(null),
  qty: z.number().int().positive().default(1),
  /** Price snapshot at add-to-cart time (base + variant delta). */
  unitPriceCents: z.number().int().nonnegative(),
});
export type CartItem = z.infer<typeof CartItem>;

export const Cart = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.enum(["open", "checked_out"]).default("open"),
  items: z.array(CartItem).default([]),
});
export type Cart = z.infer<typeof Cart>;
