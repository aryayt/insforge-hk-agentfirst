/**
 * Demo pricing: set EVERY Classic Tee variant to a flat $2.00 so live test
 * payments (Apple Pay on a phone, etc.) don't feel expensive, and mint new
 * Stripe TEST prices to match (Stripe prices are immutable — we create new
 * ones and re-link variants.stripe_price_id).
 *
 * Idempotency keys include the amount, so re-running after a price change
 * always produces the right Stripe price (the old `price_<sku>` keys from
 * stripe-prices.ts would have returned the original $21.99 objects).
 *
 * Run:  set -a; source .env.local; set +a; bun scripts/seed/demo-pricing.ts
 * Revert later by setting TARGET_CENTS back and re-running.
 */
const SK = process.env.STRIPE_SECRET_KEY;
if (!SK) throw new Error("STRIPE_SECRET_KEY missing (run: set -a; source .env.local; set +a)");

const SLUG = process.env.DEMO_PRICE_SLUG ?? "classic-tee";
const TARGET_CENTS = Number(process.env.DEMO_PRICE_CENTS ?? 200);

async function cliQuery(sql: string): Promise<{ rows: any[]; rowCount: number }> {
  const proc = Bun.spawn(["bunx", "@insforge/cli@latest", "--json", "db", "query", sql], {
    env: { ...process.env, DO_NOT_TRACK: "1" },
    stdout: "pipe",
    stderr: "ignore",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const s = out.indexOf("{");
  const e = out.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error(`db query: no JSON in output: ${out.slice(0, 200)}`);
  return JSON.parse(out.slice(s, e + 1));
}

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

// 1. Flatten DB pricing for the product.
await cliQuery(`UPDATE products SET base_price_cents = ${TARGET_CENTS} WHERE slug = '${SLUG}'`);
await cliQuery(
  `UPDATE variants SET price_delta_cents = 0
   WHERE product_id = (SELECT id FROM products WHERE slug = '${SLUG}')`,
);

// 2. Mint matching Stripe prices and re-link.
const { rows } = await cliQuery(
  `SELECT v.sku, v.color, v.size, p.name AS product_name
   FROM variants v JOIN products p ON p.id = v.product_id
   WHERE p.slug = '${SLUG}' ORDER BY v.sku`,
);
if (rows.length === 0) throw new Error(`No variants found for slug ${SLUG}`);

for (const v of rows) {
  const label = `${v.product_name} — ${v.color}${v.size ? ` / ${v.size}` : ""}`;
  const product = await stripe("products", { name: label, "metadata[sku]": v.sku }, `prod_${v.sku}`);
  const price = await stripe(
    "prices",
    { product: product.id, unit_amount: String(TARGET_CENTS), currency: "usd", "metadata[sku]": v.sku },
    `price_${v.sku}_${TARGET_CENTS}`,
  );
  await cliQuery(`UPDATE variants SET stripe_price_id = '${price.id}' WHERE sku = '${v.sku}'`);
  console.log(`✓ ${String(v.sku).padEnd(12)} ${label.padEnd(34)} $${(TARGET_CENTS / 100).toFixed(2)}  ${price.id}`);
}

console.log(`\nDone. ${rows.length} ${SLUG} variants now $${(TARGET_CENTS / 100).toFixed(2)} in DB + Stripe (test).`);
