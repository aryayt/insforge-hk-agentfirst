/**
 * create-checkout — InsForge edge function (Deno). The trusted web checkout: creates
 * the app-owned pending `order` (+ items + shipping) FIRST, then a Stripe Checkout
 * Session carrying `metadata.order_id`. On payment, InsForge's managed Stripe webhook
 * → payments.payment_history → the fulfillment trigger marks the order paid and
 * enqueues a fulfillment_jobs row → the fulfill-order function submits it to Printful.
 *
 * The browser can't INSERT into `orders` (RLS: server-write), so this runs server-side
 * with the admin client and resolves price from the DB (never trusts a client price).
 *
 * Secret/auto-injected: API_KEY, ANON_KEY, INSFORGE_BASE_URL.
 *
 * Deploy:  bunx @insforge/cli functions deploy create-checkout --file functions/create-checkout.ts
 * Invoke:  insforge.functions.invoke('create-checkout', { body: {
 *            sku, quantity?, designId?, email?, shipping:{name?,address1,address2?,city,state?,country,zip},
 *            successUrl, cancelUrl
 *          }})
 */
import { createAdminClient, createClient } from "npm:@insforge/sdk";

declare const Deno: { env: { get(name: string): string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Build a USER-scoped client + id from the forwarded JWT (guests/anon → null).
 * Uses `edgeFunctionToken` (the documented edge pattern) so getCurrentUser AND the
 * payments call run as the user — InsForge payments rejects the admin/service key
 * ("Checkout session creation requires a user token").
 */
async function userContext(
  req: Request,
): Promise<{ userId: string; client: ReturnType<typeof createClient> } | null> {
  const authz = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authz?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === Deno.env.get("ANON_KEY") || token === Deno.env.get("API_KEY")) return null;
  try {
    const client = createClient({
      baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
      edgeFunctionToken: token,
    });
    const { data, error } = await client.auth.getCurrentUser();
    if (error || !data?.user?.id) return null;
    return { userId: data.user.id, client };
  } catch {
    return null;
  }
}

type Shipping = {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
};

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: {
    sku?: string;
    quantity?: number;
    designId?: string;
    email?: string;
    shipping?: Shipping;
    successUrl?: string;
    cancelUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }

  const ctx = await userContext(req);
  if (!ctx) return json(401, { error: "Sign in to check out." });
  const userId = ctx.userId;

  const sku = body.sku?.trim();
  if (!sku) return json(400, { error: "sku required" });
  const qty = Math.max(1, Math.min(99, Math.floor(body.quantity ?? 1)));

  // Shipping is required — the fulfillment provider needs a recipient.
  const s = body.shipping ?? {};
  for (const f of ["address1", "city", "country", "zip"] as const) {
    if (!s[f]?.trim()) return json(400, { error: `shipping.${f} is required` });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  // Resolve variant + price server-side (never trust a client-sent price).
  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select("id, product_id, price_delta_cents, stripe_price_id")
    .eq("sku", sku)
    .limit(1);
  if (vErr) return json(500, { error: "variant lookup failed" });
  const variant = (variants as Array<{ id: string; product_id: string; price_delta_cents: number; stripe_price_id: string | null }>)[0];
  if (!variant) return json(404, { error: `No variant "${sku}"` });
  if (!variant.stripe_price_id) return json(422, { error: "This item isn't purchasable yet (no Stripe price)." });

  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select("base_price_cents")
    .eq("id", variant.product_id)
    .limit(1);
  if (pErr) return json(500, { error: "product lookup failed" });
  const product = (products as Array<{ base_price_cents: number }>)[0];
  if (!product) return json(404, { error: "product not found" });

  const unitPriceCents = product.base_price_cents + variant.price_delta_cents;

  // 1) Trusted pending order + item snapshot + shipping (created BEFORE the session).
  const shippingAddress = {
    name: s.name ?? null,
    address1: s.address1,
    address2: s.address2 ?? null,
    city: s.city,
    state: s.state ?? null,
    country: s.country,
    zip: s.zip,
  };
  const { data: orderRows, error: oErr } = await admin.database
    .from("orders")
    .insert([
      {
        user_id: userId,
        amount_cents: unitPriceCents * qty,
        status: "pending",
        shipping_address: shippingAddress,
        recipient_email: body.email ?? null,
      },
    ])
    .select();
  if (oErr) {
    console.error("order insert", oErr);
    return json(500, { error: "could not create order" });
  }
  const orderId = (orderRows as Array<{ id: string }>)[0]?.id;
  if (!orderId) return json(500, { error: "order id missing" });

  const { error: oiErr } = await admin.database.from("order_items").insert([
    {
      order_id: orderId,
      user_id: userId,
      variant_id: variant.id,
      design_id: body.designId ?? null,
      qty,
      unit_price_cents: unitPriceCents,
    },
  ]);
  if (oiErr) {
    console.error("order_items insert", oiErr);
    return json(500, { error: "could not create order items" });
  }

  // 2) Stripe Checkout Session with the trusted order_id in metadata.
  const origin = Deno.env.get("WEB_APP_URL") ?? "";
  // Carry the order id back to the success page so it can show status + offer cancel.
  const successBase = body.successUrl ?? `${origin}/?checkout=success`;
  const successUrl = successBase + (successBase.includes("?") ? "&" : "?") + `order=${orderId}`;
  // Flip to live by setting the STRIPE_ENV secret to "live" (after a live key + live
  // prices are configured). Defaults to test so nothing charges real money by accident.
  const stripeEnv = (Deno.env.get("STRIPE_ENV") ?? "test") as "test" | "live";
  // Created with the USER client (payments requires a user token). No `subject` — this is
  // a one-time guest-style payment; the order is linked via metadata.order_id.
  const { data, error } = await ctx.client.payments.createCheckoutSession(stripeEnv, {
    mode: "payment",
    lineItems: [{ stripePriceId: variant.stripe_price_id, quantity: qty }],
    successUrl,
    cancelUrl: body.cancelUrl ?? `${origin}/?checkout=canceled`,
    customerEmail: body.email ?? null,
    metadata: { order_id: orderId },
    idempotencyKey: `order:${orderId}`,
  });
  if (error) {
    console.error("createCheckoutSession", error);
    const detail =
      (error as { message?: string; error?: string })?.message ??
      (error as { error?: string })?.error ??
      JSON.stringify(error);
    return json(502, { error: `Checkout failed: ${detail}` });
  }
  const session = (data as { checkoutSession?: { url?: string; id?: string } } | null)?.checkoutSession;
  if (!session?.url) return json(502, { error: "Checkout session returned no URL" });

  if (session.id) {
    await admin.database.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
  }

  return json(200, { url: session.url, orderId });
}
