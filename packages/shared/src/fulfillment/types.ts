import type { OrderStatus, ShippingAddress } from "../order";

/** One line to fulfill: a mapped provider variant, a quantity, and the print file URL. */
export interface FulfillmentItem {
  /** Printful CATALOG variant id; null means this SKU isn't mapped and can't be fulfilled. */
  printfulVariantId: number | null;
  qty: number;
  /** Print file URL (the design image). null = blank product, no artwork. */
  imageUrl: string | null;
  /** Human label, used in logs/errors only. */
  name?: string;
}

export interface FulfillmentRecipient extends ShippingAddress {
  email?: string | null;
}

export interface FulfillmentInput {
  orderId: string;
  recipient: FulfillmentRecipient;
  items: FulfillmentItem[];
}

export interface SubmitResult {
  /** The provider's order id, stored on orders.provider_order_id. */
  providerOrderId: string;
  /** Order status to set after a successful submit (see each provider for semantics). */
  status: OrderStatus;
}

export interface StatusEvent {
  providerOrderId: string;
  status: OrderStatus;
}

/**
 * A print-on-demand fulfillment backend. Implementations: Printful (real) and a mock
 * fallback. Swappable so a second provider (e.g. Printify) is a new file, not a rewrite.
 */
export interface FulfillmentProvider {
  readonly name: string;
  submitOrder(input: FulfillmentInput): Promise<SubmitResult>;
  /** Parse an inbound status webhook into a terminal status, or null if not recognized. */
  parseStatusWebhook(payload: unknown): StatusEvent | null;
}
