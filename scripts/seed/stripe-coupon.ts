/**
 * Create a Stripe TEST coupon + customer-facing promotion code:
 *   coupon  AGENT50  → 50% off, single use per customer
 *   code    AGENT50  → what users type at checkout
 *
 * Checkout sessions are created with allowPromotionCodes, so Stripe shows an
 * "Add promotion code" field. Idempotent — safe to re-run.
 *
 * Run:  set -a; source .env.local; set +a; bun scripts/seed/stripe-coupon.ts
 * Custom: COUPON_CODE=ASTRO10 COUPON_PERCENT=10 bun scripts/seed/stripe-coupon.ts
 */
const SK = process.env.STRIPE_SECRET_KEY;
if (!SK) throw new Error("STRIPE_SECRET_KEY missing (run: set -a; source .env.local; set +a)");

const CODE = (process.env.COUPON_CODE ?? "AGENT50").toUpperCase();
const PERCENT = Number(process.env.COUPON_PERCENT ?? 50);

async function stripe(path: string, form: Record<string, string>, idem: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idem,
    },
    body: new URLSearchParams(form).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const coupon = await stripe(
  "coupons",
  {
    id: CODE,
    percent_off: String(PERCENT),
    duration: "once",
    name: `${PERCENT}% off (hackathon test)`,
  },
  `coupon_${CODE}_${PERCENT}`,
).catch(async (e) => {
  if (String(e).includes("already exists")) {
    console.log(`Coupon ${CODE} already exists — reusing.`);
    return { id: CODE };
  }
  throw e;
});

const promo = await stripe(
  "promotion_codes",
  { coupon: coupon.id, code: CODE },
  `promo_${CODE}_${PERCENT}`,
);

console.log(`✓ Coupon ${coupon.id}: ${PERCENT}% off (once)`);
console.log(`✓ Promotion code: ${promo.code} (${promo.active ? "active" : "INACTIVE"})`);
console.log(`\nAt checkout, click "Add promotion code" and enter ${promo.code}.`);
