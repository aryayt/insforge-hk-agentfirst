/**
 * Guest orders + Stripe (test) checkout through InsForge payments.
 *
 * Flow: session cart → `orders` row (user_id NULL, guest_token) + `order_items`
 * snapshots → InsForge `payments.createCheckoutSession('test', ...)` → user pays
 * on Stripe-hosted checkout → redirected to our /checkout/success route, which
 * verifies the guest token and marks the order paid.
 *
 * DEMO POSTURE: marking paid on the success redirect is acceptable for the
 * hackathon (Stripe only redirects after a completed test payment). The
 * production path is a webhook-backed trigger on payments.payment_history:
 * see docs/BACKEND.md.
 */
import { admin, anon } from "./insforge";
import type { SessionCartItem } from "./session";
import { cartTotalCents } from "./session";

export type VariantHit = {
  variantId: string;
  sku: string;
  productLabel: string;
  unitPriceCents: number;
  stripePriceId: string | null;
};

export async function findVariantBySku(sku: string): Promise<VariantHit | null> {
  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select()
    .eq("sku", sku)
    .limit(1);
  if (vErr) throw vErr;
  const v = (variants as Array<Record<string, unknown>>)[0];
  if (!v) return null;

  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select()
    .eq("id", v.product_id as string)
    .limit(1);
  if (pErr) throw pErr;
  const p = (products as Array<Record<string, unknown>>)[0];
  if (!p) return null;

  const size = (v.size as string | null) ?? null;
  return {
    variantId: v.id as string,
    sku: v.sku as string,
    productLabel: `${p.name as string} - ${v.color as string}${size ? ` / ${size}` : ""}`,
    unitPriceCents: (p.base_price_cents as number) + ((v.price_delta_cents as number) ?? 0),
    stripePriceId: (v.stripe_price_id as string | null) ?? null,
  };
}

export type CheckoutResult = {
  orderId: string;
  guestToken: string;
  checkoutUrl: string;
  amountCents: number;
};

export type CheckoutAttribution = {
  email?: string;
  customerName?: string;
  agentSource?: string;
  userSubject?: string | null;
  locale?: string | null;
};

export async function createGuestCheckout(
  cart: SessionCartItem[],
  attribution: CheckoutAttribution = {},
): Promise<CheckoutResult> {
  const { email } = attribution;
  if (cart.length === 0) throw new Error("Cart is empty. Add something first.");

  const missing = cart.filter((i) => !i.stripePriceId);
  if (missing.length > 0) {
    throw new Error(
      `These variants have no Stripe price yet: ${missing.map((i) => i.sku).join(", ")}. ` +
        "Run `bun scripts/seed/stripe-prices.ts` once to create test-mode prices.",
    );
  }

  const amountCents = cartTotalCents(cart);
  const guestToken = crypto.randomUUID();
  const previewUrl = cart.find((i) => i.designUrl)?.designUrl ?? null;

  const { data: orderRows, error: oErr } = await admin.database
    .from("orders")
    .insert([
      {
        user_id: null,
        amount_cents: amountCents,
        status: "pending",
        email: email ?? null,
        guest_token: guestToken,
        design_preview_url: previewUrl,
        customer_name: attribution.customerName ?? null,
        agent_source: attribution.agentSource ?? null,
        agent_user_subject: attribution.userSubject ?? null,
        agent_locale: attribution.locale ?? null,
      },
    ])
    .select();
  if (oErr) throw oErr;
  const order = (orderRows as Array<{ id: string }>)[0];
  if (!order?.id) throw new Error("Order insert returned no id.");

  const { error: iErr } = await admin.database.from("order_items").insert(
    cart.map((i) => ({
      order_id: order.id,
      user_id: null,
      variant_id: i.variantId,
      design_id: i.designId ?? null,
      qty: i.qty,
      unit_price_cents: i.unitPriceCents,
      product_label: i.productLabel,
      design_label: i.designLabel ?? null,
    })),
  );
  if (iErr) throw iErr;

  // `||` (not `??`) so an empty MCP_PUBLIC_URL placeholder in .env falls back to
  // localhost rather than producing a relative URL (InsForge requires absolute URLs).
  const publicUrl = process.env.MCP_PUBLIC_URL || `http://localhost:${process.env.MCP_PORT || 8788}`;
  // InsForge's createCheckoutSessionBodySchema is strict. Verified against
  // @insforge/shared-schemas: only mode/lineItems/successUrl/cancelUrl/subject/
  // customerEmail/metadata/idempotencyKey are accepted. There is no coupon/promo
  // field, so discounts must be baked into the Stripe Price (see demo-pricing.ts).
  const checkoutBody = {
    mode: "payment" as const,
    lineItems: cart.map((i) => ({ stripePriceId: i.stripePriceId as string, quantity: i.qty })),
    successUrl: `${publicUrl}/checkout/success?order=${order.id}&t=${guestToken}`,
    cancelUrl: `${publicUrl}/checkout/cancel?order=${order.id}`,
    customerEmail: email ?? null,
    metadata: { order_id: order.id },
    idempotencyKey: `order:${order.id}`,
  };
  if (!anon) {
    throw new Error(
      "Checkout needs the anon key. Set INSFORGE_ANON_KEY (deploy) or VITE_INSFORGE_ANON_KEY (local). " +
        "InsForge's payments API rejects the admin/service key for checkout sessions.",
    );
  }
  const { data, error } = await anon.payments.createCheckoutSession("test", checkoutBody);
  if (error) throw new Error(`Checkout session failed: ${error.message ?? String(error)}`);
  const session = (data as { checkoutSession?: { id?: string; url?: string } })?.checkoutSession;
  if (!session?.url) throw new Error("Stripe returned no checkout URL.");

  await admin.database
    .from("orders")
    .update({ stripe_session_id: session.id ?? null })
    .eq("id", order.id);

  return { orderId: order.id, guestToken, checkoutUrl: session.url, amountCents };
}

export type OrderView = {
  id: string;
  status: string;
  amountCents: number;
  email: string | null;
  designPreviewUrl: string | null;
  items: Array<{ productLabel: string | null; designLabel: string | null; qty: number; unitPriceCents: number }>;
};

export async function getOrder(orderId: string): Promise<OrderView | null> {
  const { data: orders, error: oErr } = await admin.database
    .from("orders")
    .select()
    .eq("id", orderId)
    .limit(1);
  if (oErr) throw oErr;
  const o = (orders as Array<Record<string, unknown>>)[0];
  if (!o) return null;

  const { data: items, error: iErr } = await admin.database
    .from("order_items")
    .select()
    .eq("order_id", orderId);
  if (iErr) throw iErr;

  return {
    id: o.id as string,
    status: o.status as string,
    amountCents: o.amount_cents as number,
    email: (o.email as string | null) ?? null,
    designPreviewUrl: (o.design_preview_url as string | null) ?? null,
    items: (items as Array<Record<string, unknown>>).map((i) => ({
      productLabel: (i.product_label as string | null) ?? null,
      designLabel: (i.design_label as string | null) ?? null,
      qty: i.qty as number,
      unitPriceCents: i.unit_price_cents as number,
    })),
  };
}

/** Mark a pending guest order paid after Stripe success redirect (token-gated). */
export async function markPaidFromSuccessRedirect(orderId: string, guestToken: string): Promise<boolean> {
  const { data: orders, error } = await admin.database
    .from("orders")
    .select()
    .eq("id", orderId)
    .eq("guest_token", guestToken)
    .limit(1);
  if (error) throw error;
  const o = (orders as Array<{ id: string; status: string }>)[0];
  if (!o) return false;
  if (o.status !== "pending") return true;
  const { error: uErr } = await admin.database
    .from("orders")
    .update({ status: "paid" })
    .eq("id", orderId)
    .eq("guest_token", guestToken);
  if (uErr) throw uErr;
  return true;
}
