import { insforge } from "./insforge";

export type TeeVariant = {
  color: string;
  size: string | null;
  sku: string;
  priceDeltaCents: number;
  stripePriceId: string | null;
};

export type Tee = {
  id: string;
  name: string;
  basePriceCents: number;
  variants: TeeVariant[];
};

type ProductRow = { id: string; name: string; base_price_cents: number };
type VariantRow = {
  color: string;
  size: string | null;
  sku: string;
  price_delta_cents: number;
  stripe_price_id: string | null;
};

/** Read one product + its variants from the public catalog (anon, RLS public-read). */
export async function fetchProduct(slug = "classic-tee"): Promise<Tee> {
  const { data: products, error: pErr } = await insforge.database
    .from("products")
    .select()
    .eq("slug", slug)
    .limit(1);
  if (pErr) throw pErr;

  const product = (products as ProductRow[])[0];
  if (!product) throw new Error(`No product "${slug}"`);

  const { data: variants, error: vErr } = await insforge.database
    .from("variants")
    .select()
    .eq("product_id", product.id);
  if (vErr) throw vErr;

  return {
    id: product.id,
    name: product.name,
    basePriceCents: product.base_price_cents,
    variants: (variants as VariantRow[]).map((v) => ({
      color: v.color,
      size: v.size,
      sku: v.sku,
      priceDeltaCents: v.price_delta_cents,
      stripePriceId: v.stripe_price_id,
    })),
  };
}

export const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
