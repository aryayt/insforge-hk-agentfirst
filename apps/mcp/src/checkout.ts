import type { ShippingAddress } from "@app/shared";
import { getCart } from "./cart";
import { admin } from "./insforge";

export interface CheckoutInput {
  successUrl?: string;
  cancelUrl?: string;
  email?: string | null;
  /** Captured up front (Stripe Checkout via InsForge can't collect it); the provider needs it. */
  shipping?: ShippingAddress | null;
}

export interface CheckoutResult {
  orderId: string;
  url: string;
  amountCents: number;
}

/**
 * Build a Stripe Checkout Session (test) for the user's open cart and create the trusted
 * pending order it fulfills. Order of operations follows the InsForge payments skill:
 * create the app-owned order row FIRST, then pass its id in checkout metadata so the
 * managed Stripe webhook + fulfillment trigger can mark it paid and enqueue fulfillment.
 */
export async function createCheckout(
  userId: string,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const cart = await getCart(userId);
  if (!cart || cart.items.length === 0) {
    throw new Error("Cart is empty — add an item before checking out.");
  }

  // Every variant must have a mirrored Stripe price.
  const variantIds = [...new Set(cart.items.map((i) => i.variantId))];
  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select("id, sku, stripe_price_id")
    .in("id", variantIds);
  if (vErr) throw vErr;
  const byId = new Map(
    (variants as { id: string; sku: string; stripe_price_id: string | null }[]).map((v) => [v.id, v]),
  );
  const unpriced = cart.items.filter((i) => !byId.get(i.variantId)?.stripe_price_id);
  if (unpriced.length) {
    const skus = unpriced.map((i) => byId.get(i.variantId)?.sku ?? i.variantId).join(", ");
    throw new Error(
      `These variants have no Stripe price yet (${skus}). Mirror the catalog first: \`insforge payments sync --environment test\`.`,
    );
  }

  const amountCents = cart.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);

  // 1) Trusted pending order + item snapshot (created BEFORE the session, per the skill).
  const { data: orderRows, error: oErr } = await admin.database
    .from("orders")
    .insert([
      {
        user_id: userId,
        amount_cents: amountCents,
        status: "pending",
        shipping_address: input.shipping ?? null,
        recipient_email: input.email ?? null,
      },
    ])
    .select();
  if (oErr) throw oErr;
  const orderRow = (orderRows as { id: string }[])[0];
  if (!orderRow) throw new Error("Failed to create order.");
  const orderId = orderRow.id;

  const { error: oiErr } = await admin.database.from("order_items").insert(
    cart.items.map((i) => ({
      order_id: orderId,
      user_id: userId,
      variant_id: i.variantId,
      design_id: i.designId,
      qty: i.qty,
      unit_price_cents: i.unitPriceCents,
    })),
  );
  if (oiErr) throw oiErr;

  // 2) Stripe Checkout Session (test) via InsForge-managed payments.
  const baseUrl = process.env.WEB_APP_URL ?? "http://localhost:5173";
  const { data, error } = await admin.payments.createCheckoutSession("test", {
    mode: "payment",
    lineItems: cart.items.map((i) => ({
      stripePriceId: byId.get(i.variantId)!.stripe_price_id as string,
      quantity: i.qty,
    })),
    successUrl: input.successUrl ?? `${baseUrl}/checkout/success?order=${orderId}`,
    cancelUrl: input.cancelUrl ?? `${baseUrl}/cart`,
    subject: { type: "user", id: userId },
    customerEmail: input.email ?? null,
    metadata: { order_id: orderId },
    idempotencyKey: `order:${orderId}`,
  });
  if (error) throw error;

  const session = (data as { checkoutSession?: { url?: string; id?: string } } | null)?.checkoutSession;
  if (!session?.url) throw new Error("Checkout session created but no URL was returned.");

  // Record the session id and close the cart so the next add starts a fresh one.
  if (session.id) {
    await admin.database.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
  }
  await admin.database.from("carts").update({ status: "checked_out" }).eq("id", cart.id);

  return { orderId, url: session.url, amountCents };
}
