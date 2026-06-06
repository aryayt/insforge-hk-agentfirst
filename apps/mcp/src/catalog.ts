import type { Product, Variant } from "@app/shared";
import { admin } from "./insforge";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  type: Product["type"];
  description: string;
  base_price_cents: number;
  active: boolean;
};

type VariantRow = {
  id: string;
  product_id: string;
  color: string;
  size: string | null;
  sku: string;
  price_delta_cents: number;
  stripe_price_id: string | null;
  printful_variant_id: number | null;
};

function toVariant(r: VariantRow): Variant {
  return {
    id: r.id,
    productId: r.product_id,
    color: r.color,
    size: r.size,
    sku: r.sku,
    priceDeltaCents: r.price_delta_cents,
    stripePriceId: r.stripe_price_id,
    printfulVariantId: r.printful_variant_id ?? null,
  };
}

function toProduct(p: ProductRow, variants: VariantRow[]): Product {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    description: p.description,
    basePriceCents: p.base_price_cents,
    active: p.active,
    variants: variants.filter((v) => v.product_id === p.id).map(toVariant),
  };
}

export async function listProducts(): Promise<Product[]> {
  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select()
    .eq("active", true)
    .order("name", { ascending: true });
  if (pErr) throw pErr;

  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select();
  if (vErr) throw vErr;

  return (products as ProductRow[]).map((p) =>
    toProduct(p, variants as VariantRow[]),
  );
}

export async function getProduct(slug: string): Promise<Product | null> {
  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select()
    .eq("slug", slug)
    .limit(1);
  if (pErr) throw pErr;

  const row = (products as ProductRow[])[0];
  if (!row) return null;

  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select()
    .eq("product_id", row.id);
  if (vErr) throw vErr;

  return toProduct(row, variants as VariantRow[]);
}

export type ResolvedVariant = {
  product: Product;
  variant: Variant;
  /** base price + this variant's delta. */
  unitPriceCents: number;
  /** e.g. "Classic Tee — White / M". */
  label: string;
};

/** Resolve a SKU to its variant + parent product + price snapshot (for the cart). */
export async function getVariantBySku(sku: string): Promise<ResolvedVariant | null> {
  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select()
    .eq("sku", sku)
    .limit(1);
  if (vErr) throw vErr;

  const vRow = (variants as VariantRow[])[0];
  if (!vRow) return null;

  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select()
    .eq("id", vRow.product_id)
    .limit(1);
  if (pErr) throw pErr;

  const pRow = (products as ProductRow[])[0];
  if (!pRow) return null;

  const product = toProduct(pRow, [vRow]);
  const variant = product.variants[0]!;
  const unitPriceCents = product.basePriceCents + (variant.priceDeltaCents ?? 0);
  const label = `${product.name} — ${variant.color}${variant.size ? ` / ${variant.size}` : ""}`;
  return { product, variant, unitPriceCents, label };
}
