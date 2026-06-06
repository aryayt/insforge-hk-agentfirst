import { z } from "zod";

export const OrderStatus = z.enum(["pending", "paid", "fulfilled", "failed"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** Immutable snapshot of a purchased line (variant + design + price at time of order). */
export const OrderItem = z.object({
  id: z.string(),
  orderId: z.string(),
  variantId: z.string(),
  designId: z.string().nullable().default(null),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});
export type OrderItem = z.infer<typeof OrderItem>;

export const Order = z.object({
  id: z.string(),
  userId: z.string(),
  /** Stripe Checkout Session id; set when checkout is created. */
  stripeSessionId: z.string().nullable().default(null),
  amountCents: z.number().int().nonnegative(),
  status: OrderStatus.default("pending"),
  items: z.array(OrderItem).default([]),
  createdAt: z.string().datetime().optional(),
});
export type Order = z.infer<typeof Order>;
