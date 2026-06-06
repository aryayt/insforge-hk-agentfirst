/**
 * printful-catalog — InsForge edge function (Deno). Returns live product info from
 * Printful's catalog for the studio's info panel: the real available sizes/colors
 * and Printful's per-variant base cost (for the price breakdown vs our retail).
 *
 * Secret: PRINTFUL_API_KEY.
 *
 * Deploy:  bunx @insforge/cli functions deploy printful-catalog --file functions/printful-catalog.ts
 * Invoke:  insforge.functions.invoke('printful-catalog', { body: { productId } })
 */
declare const Deno: { env: { get(name: string): string | undefined } };

const PRINTFUL_BASE_URL = "https://api.printful.com";

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

function pfHeaders(): Record<string, string> {
  const token = Deno.env.get("PRINTFUL_API_KEY");
  if (!token) throw new Error("PRINTFUL_API_KEY secret is not set");
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  const storeId = Deno.env.get("PRINTFUL_STORE_ID");
  if (storeId) h["X-PF-Store-Id"] = storeId;
  return h;
}

type PfVariant = {
  id: number;
  color?: string | null;
  size?: string | null;
  price?: string | null; // Printful base cost, string like "12.95"
  in_stock?: boolean;
};

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: { productId?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }
  if (!body.productId) return json(400, { error: "productId required" });

  try {
    const res = await fetch(`${PRINTFUL_BASE_URL}/products/${body.productId}`, { headers: pfHeaders() });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json(502, {
        error: `Printful product lookup failed (${res.status}): ${j?.error?.message ?? "unknown"}`,
      });
    }
    const product = j?.result?.product ?? {};
    const variants: PfVariant[] = j?.result?.variants ?? [];

    return json(200, {
      product: {
        id: product.id,
        title: product.title,
        brand: product.brand,
        model: product.model,
      },
      // Distinct colors/sizes for the picker + per-variant cost for the price breakdown.
      colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
      sizes: [...new Set(variants.map((v) => v.size).filter(Boolean))],
      variants: variants.map((v) => ({
        id: v.id,
        color: v.color ?? null,
        size: v.size ?? null,
        // Printful base cost in cents (what fulfillment costs us).
        costCents: v.price != null ? Math.round(parseFloat(v.price) * 100) : null,
        inStock: v.in_stock ?? null,
      })),
    });
  } catch (e) {
    console.error("printful-catalog error", e);
    return json(502, { error: e instanceof Error ? e.message : "catalog lookup failed" });
  }
}
