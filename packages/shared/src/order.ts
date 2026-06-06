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

/** Shipping recipient captured from the Stripe Checkout Session; the POD provider needs it. */
export const ShippingAddress = z.object({
  name: z.string().nullable().default(null),
  address1: z.string(),
  address2: z.string().nullable().default(null),
  city: z.string(),
  /** State/province code where applicable. */
  state: z.string().nullable().default(null),
  /** ISO country code, e.g. "US". */
  country: z.string(),
  zip: z.string(),
});
export type ShippingAddress = z.infer<typeof ShippingAddress>;

export const Order = z.object({
  id: z.string(),
  userId: z.string(),
  /** Stripe Checkout Session id; set when checkout is created. */
  stripeSessionId: z.string().nullable().default(null),
  amountCents: z.number().int().nonnegative(),
  status: OrderStatus.default("pending"),
  items: z.array(OrderItem).default([]),
  /** Fulfillment provider that made this order ("printful" | "mock"); null until submitted. */
  provider: z.string().nullable().default(null),
  /** The provider's own order id, stored after a successful submit. */
  providerOrderId: z.string().nullable().default(null),
  /** Captured from Stripe Checkout at payment; required to submit to the provider. */
  shippingAddress: ShippingAddress.nullable().default(null),
  recipientEmail: z.string().nullable().default(null),
  createdAt: z.string().datetime().optional(),
});
export type Order = z.infer<typeof Order>;
