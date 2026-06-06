import { insforge } from "./insforge";

type BuyNowOpts = {
  stripePriceId: string;
  quantity: number;
  email?: string;
  metadata?: Record<string, string>;
};

/**
 * Create a one-time Stripe Checkout Session for a single configured line item
 * and redirect the browser to Stripe. Anonymous (guest) checkout — `mode:
 * "payment"` needs no subject. Stripe is the source of truth; a webhook-backed
 * order is fulfilled server-side, so the success page only reflects state.
 */
export async function buyNow(opts: BuyNowOpts): Promise<void> {
  const { data, error } = await insforge.payments.createCheckoutSession("test", {
    mode: "payment",
    lineItems: [{ stripePriceId: opts.stripePriceId, quantity: opts.quantity }],
    successUrl: `${window.location.origin}/?checkout=success`,
    cancelUrl: `${window.location.origin}/?checkout=canceled`,
    customerEmail: opts.email || null,
    metadata: opts.metadata ?? {},
  });

  if (error) throw error;
  const url = data?.checkoutSession?.url;
  if (!url) throw new Error("Checkout session did not return a URL.");
  window.location.assign(url);
}
