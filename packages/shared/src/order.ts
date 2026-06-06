import { z } from "zod";

export const OrderStatus = z.enum(["pending", "paid", "fulfilled", "failed", "canceled"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** Immutable snapshot of a purchased line (variant + design + price at time of order). */
export const OrderItem = z.object({
  id: z.string(),
  orderId: z.string(),
  variantId: z.string(),
  designId: z.string().nullable().default(null),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  /** Denormalized labels so an order reads without joins (e.g. "Classic Tee — White / M"). */
  productLabel: z.string().nullable().default(null),
  designLabel: z.string().nullable().default(null),
});
export type OrderItem = z.infer<typeof OrderItem>;

/**
 * An order. Written server-side (admin client / Stripe webhook). Supports guest
 * and agent checkout: `userId` is null for guests, who are identified by
 * `guestToken` + `email`. `designPreviewUrl` carries the actual artwork through
 * to fulfillment (Stripe metadata only ever holds this short URL, never base64).
 */
export const Order = z.object({
  id: z.string(),
  /** Null for guest/agent orders. */
  userId: z.string().nullable().default(null),
  /** Stripe Checkout Session id; set when checkout is created. */
  stripeSessionId: z.string().nullable().default(null),
  amountCents: z.number().int().nonnegative(),
  status: OrderStatus.default("pending"),
  /** Guest checkout identity + receipt. */
  email: z.string().nullable().default(null),
  guestToken: z.string().nullable().default(null),
  customerName: z.string().nullable().default(null),
  /** Public URL of the design artwork the printer fulfills against. */
  designPreviewUrl: z.string().nullable().default(null),
  /** Agent provenance (which surface/agent placed the order). */
  agentSource: z.string().nullable().default(null),
  agentUserSubject: z.string().nullable().default(null),
  agentLocale: z.string().nullable().default(null),
  /** Fulfillment provider bookkeeping once the order leaves our system. */
  provider: z.string().nullable().default(null),
  providerOrderId: z.string().nullable().default(null),
  items: z.array(OrderItem).default([]),
  createdAt: z.string().datetime().optional(),
});
export type Order = z.infer<typeof Order>;
