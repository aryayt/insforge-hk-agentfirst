/**
 * Backfill `variants.printful_variant_id` from Printful's LIVE catalog.
 *
 * We deliberately do NOT commit guessed Printful catalog ids — they'd risk wrong orders.
 * Instead, run this once a Printful token exists; it looks up the real variant ids by
 * matching color + size and UPDATEs each of our variants.
 *
 * Usage (from repo root, in a worktree linked to the InsForge project):
 *   PRINTFUL_API_KEY=... \
 *   INSFORGE_API_BASE_URL=... INSFORGE_API_KEY=... \
 *   bun run scripts/printful/map-variants.ts            # dry run (prints the plan)
 *   bun run scripts/printful/map-variants.ts --apply    # writes printful_variant_id
 *
 * Adjust SLUG_TO_PRINTFUL_PRODUCT below if a catalog product id is wrong for your account
 * (verify in the Printful dashboard or `GET /products`). The variant matching does the rest.
 */
import { createAdminClient } from "@insforge/sdk";

const PRINTFUL_BASE_URL = "https://api.printful.com";

// Our product slug → Printful CATALOG product id. Best-known public ids — VERIFY against
// your account's catalog (`GET /products`) before relying on them; only the product id is
// guessed here, the per-variant ids are always read live below.
const SLUG_TO_PRINTFUL_PRODUCT: Record<string, number> = {
  "classic-tee": 71, // Bella + Canvas 3001 Unisex Staple T-Shirt
  "ceramic-mug": 19, // White Glossy Mug 11oz
  "dad-cap": 206, // Classic Dad Hat (verify; caps vary by account/region)
};

type OurVariant = {
  id: string;
  sku: string;
  color: string;
  size: string | null;
  product_slug: string;
};

type PfVariant = { id: number; color: string | null; size: string | null };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function resolveEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

async function fetchPrintfulVariants(productId: number, token: string): Promise<PfVariant[]> {
  const res = await fetch(`${PRINTFUL_BASE_URL}/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    result?: { variants?: PfVariant[] };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Printful GET /products/${productId} failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  return json.result?.variants ?? [];
}

/** Match our (color,size) to a Printful variant. size null → first variant of that color. */
function matchVariant(ours: OurVariant, pf: PfVariant[]): PfVariant | undefined {
  const byColor = pf.filter((v) => norm(v.color) === norm(ours.color));
  const pool = byColor.length ? byColor : pf;
  if (ours.size == null) return pool[0];
  return pool.find((v) => norm(v.size) === norm(ours.size));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const token = resolveEnv("PRINTFUL_API_KEY");
  const admin = createAdminClient({
    baseUrl: resolveEnv("INSFORGE_API_BASE_URL"),
    apiKey: resolveEnv("INSFORGE_API_KEY"),
  });

  // Load our variants with their product slug.
  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select("id, slug");
  if (pErr) throw pErr;
  const slugById = new Map((products as { id: string; slug: string }[]).map((p) => [p.id, p.slug]));

  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select("id, sku, color, size, product_id");
  if (vErr) throw vErr;

  const ours: OurVariant[] = (variants as (OurVariant & { product_id: string })[]).map((v) => ({
    id: v.id,
    sku: v.sku,
    color: v.color,
    size: v.size,
    product_slug: slugById.get(v.product_id) ?? "",
  }));

  // Fetch each catalog product's variants once.
  const pfCache = new Map<number, PfVariant[]>();
  for (const productId of new Set(Object.values(SLUG_TO_PRINTFUL_PRODUCT))) {
    pfCache.set(productId, await fetchPrintfulVariants(productId, token));
  }

  let matched = 0;
  for (const v of ours) {
    const productId = SLUG_TO_PRINTFUL_PRODUCT[v.product_slug];
    if (!productId) {
      console.warn(`• ${v.sku}: no Printful product mapped for slug "${v.product_slug}" — skipped`);
      continue;
    }
    const pfVariant = matchVariant(v, pfCache.get(productId) ?? []);
    if (!pfVariant) {
      console.warn(`• ${v.sku}: no Printful variant matched (${v.color}/${v.size ?? "one-size"})`);
      continue;
    }
    matched++;
    console.log(`• ${v.sku} → printful_variant_id ${pfVariant.id} (${pfVariant.color}/${pfVariant.size ?? "-"})`);
    if (apply) {
      const { error } = await admin.database
        .from("variants")
        .update({ printful_variant_id: pfVariant.id })
        .eq("id", v.id);
      if (error) throw error;
    }
  }

  console.log(
    `\n${matched}/${ours.length} variants matched. ${apply ? "Applied." : "Dry run — re-run with --apply to write."}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
