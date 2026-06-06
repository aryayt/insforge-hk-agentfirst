/**
 * Headless end-to-end check of the exact backend paths the browser uses, via the
 * anon SDK client (same creds as the app). Proves: catalog read, guest-order
 * insert under RLS, Stripe checkout session creation, and the paid update.
 *
 * Run: cd apps/web && set -a; source ../../.env.local; set +a; bun verify-flow.ts
 */
import { createClient } from "@insforge/sdk";

const baseUrl = process.env.VITE_INSFORGE_API_BASE_URL!;
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!;
const insforge = createClient({ baseUrl, anonKey });

const ok = (m: string) => console.log(`✓ ${m}`);
const fail = (m: string, e?: unknown) => {
  console.error(`✗ ${m}`, e ?? "");
  process.exitCode = 1;
};

// 1) Catalog read (anon, public)
const { data: products, error: pErr } = await insforge.database.from("products").select().eq("active", true);
const { data: variants, error: vErr } = await insforge.database.from("variants").select();
if (pErr || vErr) fail("catalog read", pErr ?? vErr);
else ok(`catalog read: ${products.length} products, ${variants.length} variants`);

const variant = (variants as any[]).find((v) => v.sku === "tee-blk-m");
if (!variant?.stripe_price_id) fail("tee-blk-m has no stripe_price_id");
else ok(`variant tee-blk-m → ${variant.stripe_price_id}`);

// 2) Guest order insert (anon RLS: user_id IS NULL)
const token = crypto.randomUUID();
const orderId = crypto.randomUUID();
const { error: oErr } = await insforge.database.from("orders").insert([
  { id: orderId, user_id: null, status: "pending", amount_cents: 1999, guest_token: token, email: "verify@agentshop.test" },
]);
if (oErr) fail("guest order insert", oErr);
else ok(`guest order inserted ${orderId.slice(0, 8)}`);

const { error: iErr } = await insforge.database.from("order_items").insert([
  { id: crypto.randomUUID(), order_id: orderId, user_id: null, variant_id: variant.id, qty: 1, unit_price_cents: 1999, product_label: "Classic Tee — Black / M", design_label: "text: \"VERIFY\"" },
]);
if (iErr) fail("order_items insert", iErr);
else ok("order_item inserted");

// 3) Stripe checkout session (THE critical integration)
try {
  const { data, error } = await insforge.payments.createCheckoutSession("test", {
    mode: "payment",
    lineItems: [{ stripePriceId: variant.stripe_price_id, quantity: 1 }],
    successUrl: "http://localhost:5173/success?order=" + orderId + "&token=" + token,
    cancelUrl: "http://localhost:5173/cart",
    customerEmail: "verify@agentshop.test",
    metadata: { order_id: orderId, guest_token: token },
    idempotencyKey: "order:" + orderId,
  });
  if (error) fail("createCheckoutSession", error);
  else {
    const url = (data as any)?.checkoutSession?.url;
    if (url) ok(`checkout session: ${url.slice(0, 60)}…`);
    else fail("checkout session returned no url", data);
  }
} catch (e) {
  fail("createCheckoutSession threw", e);
}

// 4) Paid update (anon RLS update)
const { error: uErr } = await insforge.database.from("orders").update({ status: "paid" }).eq("id", orderId).eq("guest_token", token);
if (uErr) fail("paid update", uErr);
else ok("order marked paid");

// 5) Read back
const { data: back } = await insforge.database.from("orders").select().eq("id", orderId).limit(1);
ok(`read back: status=${(back as any[])?.[0]?.status}`);
console.log("\nDone.");
