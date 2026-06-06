import { insforge } from "./insforge";

export type ShippingInput = {
  name?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  country: string;
  zip: string;
};

type BuyNowOpts = {
  /** Variant SKU — the server resolves price + Stripe price id from it. */
  sku: string;
  quantity: number;
  email?: string;
  /** Persisted design id, snapshotted onto the order so fulfillment has the artwork. */
  designId?: string;
  shipping: ShippingInput;
};

/**
 * Trusted web checkout. Calls the `create-checkout` edge function, which creates the
 * pending order (+ items + shipping) server-side and returns a Stripe Checkout URL with
 * the order_id in metadata — so payment flows through to Printful fulfillment. The
 * browser can't write `orders` directly (RLS), hence the server hop.
 */
export async function buyNow(opts: BuyNowOpts): Promise<void> {
  const { data, error } = await insforge.functions.invoke("create-checkout", {
    body: {
      sku: opts.sku,
      quantity: opts.quantity,
      designId: opts.designId,
      email: opts.email,
      shipping: opts.shipping,
      successUrl: `${window.location.origin}/?checkout=success`,
      cancelUrl: `${window.location.origin}/?checkout=canceled`,
    },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const res = data as { url?: string; error?: string };
  if (!res?.url) throw new Error(res?.error || "Checkout did not return a URL.");
  window.location.assign(res.url);
}
