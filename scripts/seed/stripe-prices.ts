/**
 * Create one Stripe (TEST) Product + Price per catalog variant, then store the
 * resulting `stripe_price_id` on the matching `variants` row. Idempotent:
 * variants that already carry a price id are skipped; Stripe calls use
 * idempotency keys derived from the SKU so re-runs never duplicate.
 *
 * DB ops go through `insforge db query` (project backend — reliably reachable).
 * Stripe ops go through the REST API directly (no SDK dep needed).
 *
 * Run:  set -a; source .env.local; set +a; bun scripts/seed/stripe-prices.ts
 */
const SK = process.env.STRIPE_SECRET_KEY;
if (!SK) throw new Error("STRIPE_SECRET_KEY missing (run: set -a; source .env.local; set +a)");

async function cliQuery(sql: string): Promise<{ rows: any[]; rowCount: number }> {
  const proc = Bun.spawn(["npx", "--yes", "@insforge/cli@latest", "--json", "db", "query", sql], {
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

const sqlEsc = (s: string) => s.replace(/'/g, "''");

const { rows } = await cliQuery(
  `SELECT v.id, v.sku, v.color, v.size, v.price_delta_cents, v.stripe_price_id,
          p.name AS product_name, p.base_price_cents
   FROM variants v JOIN products p ON p.id = v.product_id
   WHERE v.stripe_price_id IS NULL
   ORDER BY v.sku`,
);

if (rows.length === 0) {
  console.log("All variants already have a stripe_price_id. Nothing to do.");
  process.exit(0);
}

const updates: Array<[string, string]> = []; // [sku, priceId]
for (const v of rows) {
  const amount = v.base_price_cents + (v.price_delta_cents ?? 0);
  const label = `${v.product_name} — ${v.color}${v.size ? ` / ${v.size}` : ""}`;
  const product = await stripe("products", { name: label, "metadata[sku]": v.sku }, `prod_${v.sku}`);
  const price = await stripe(
    "prices",
    { product: product.id, unit_amount: String(amount), currency: "usd", "metadata[sku]": v.sku },
    `price_${v.sku}`,
  );
  updates.push([v.sku, price.id]);
  console.log(`✓ ${String(v.sku).padEnd(12)} ${label.padEnd(34)} $${(amount / 100).toFixed(2)}  ${price.id}`);
}

const values = updates.map(([sku, pid]) => `('${sqlEsc(sku)}','${sqlEsc(pid)}')`).join(",");
await cliQuery(
  `UPDATE variants AS v SET stripe_price_id = d.pid
   FROM (VALUES ${values}) AS d(sku, pid)
   WHERE v.sku = d.sku`,
);

console.log(`\nDone. Created + linked ${updates.length} Stripe prices.`);
