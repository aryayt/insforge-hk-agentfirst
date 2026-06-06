// fulfill-order — drains the fulfillment_jobs outbox and submits each paid order to the
// print-on-demand provider (Printful when PRINTFUL_API_KEY is set, else a mock fallback).
// Invoked on a schedule (every minute) and manually for the demo.
//
// Runs on Deno Subhosting, which can't import the @app/shared workspace package, so the
// provider logic below is a compact MIRROR of packages/shared/src/fulfillment/* — keep them
// in sync. Uses the project admin key (a secret) to read/write owner-RLS tables.
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Fulfill-Secret",
};

type ShippingAddress = {
  name: string | null;
  address1: string;
  address2: string | null;
  city: string;
  state: string | null;
  country: string;
  zip: string;
};

type FulfillItem = { printfulVariantId: number | null; qty: number; imageUrl: string | null; name?: string };
type FulfillInput = { orderId: string; recipient: ShippingAddress & { email?: string | null }; items: FulfillItem[] };
type SubmitResult = { providerOrderId: string; status: "paid" | "fulfilled" };

// ── provider: mock ────────────────────────────────────────────────────────────
function mockSubmit(input: FulfillInput): SubmitResult {
  console.log(`[mock-fulfillment] order ${input.orderId}: ${input.items.length} item(s) → ${input.recipient.city}, ${input.recipient.country}`);
  return { providerOrderId: `mock_${input.orderId}`, status: "fulfilled" };
}

// ── provider: Printful v1 POST /orders ──────────────────────────────────────────
async function printfulSubmit(
  input: FulfillInput,
  opts: { apiKey: string; storeId?: string; confirm: boolean },
): Promise<SubmitResult> {
  const unmapped = input.items.filter((i) => i.printfulVariantId == null);
  if (unmapped.length) {
    throw new Error(
      `${unmapped.length} item(s) have no printful_variant_id (${unmapped.map((i) => i.name ?? "item").join(", ")}). Run scripts/printful/map-variants.ts.`,
    );
  }
  const r = input.recipient;
  const body = {
    confirm: opts.confirm,
    recipient: {
      name: r.name ?? undefined,
      address1: r.address1,
      address2: r.address2 ?? undefined,
      city: r.city,
      state_code: r.state ?? undefined,
      country_code: r.country,
      zip: r.zip,
      email: r.email ?? undefined,
    },
    items: input.items.map((i) => ({
      variant_id: i.printfulVariantId,
      quantity: i.qty,
      files: i.imageUrl ? [{ url: i.imageUrl }] : [],
    })),
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.storeId) headers["X-PF-Store-Id"] = opts.storeId;

  const res = await fetch("https://api.printful.com/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Printful POST /orders failed (${res.status}): ${json?.error?.message ?? "unknown error"}`);
  }
  const id = json?.result?.id;
  if (id == null) throw new Error("Printful POST /orders returned no order id");
  // Draft/confirmed but not shipped — printful-webhook advances orders.status later.
  return { providerOrderId: String(id), status: "paid" };
}

async function submitOrder(input: FulfillInput): Promise<{ result: SubmitResult; provider: string }> {
  const apiKey = Deno.env.get("PRINTFUL_API_KEY");
  const forced = (Deno.env.get("FULFILLMENT_PROVIDER") ?? "").toLowerCase();
  const useMock = forced === "mock" || (forced !== "printful" && !apiKey);
  if (useMock) return { result: mockSubmit(input), provider: "mock" };
  const result = await printfulSubmit(input, {
    apiKey: apiKey as string,
    storeId: Deno.env.get("PRINTFUL_STORE_ID") ?? undefined,
    confirm: Deno.env.get("PRINTFUL_CONFIRM_ORDERS") === "true",
  });
  return { result, provider: "printful" };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  // Optional shared-secret guard so only the schedule / trusted caller can drain.
  const secret = Deno.env.get("FULFILL_SECRET");
  if (secret && req.headers.get("X-Fulfill-Secret") !== secret) {
    return json({ error: "forbidden" }, 403);
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL") as string,
    apiKey: Deno.env.get("INSFORGE_API_KEY") as string,
  });

  // Claim pending jobs (cap retries on failed ones).
  const { data: jobs, error: jErr } = await admin.database
    .from("fulfillment_jobs")
    .select("id, order_id, user_id, attempts, status")
    .in("status", ["pending", "failed"])
    .lt("attempts", 5)
    .limit(20);
  if (jErr) return json({ error: jErr.message ?? String(jErr) }, 500);

  const results: { orderId: string; ok: boolean; detail: string }[] = [];

  for (const job of (jobs ?? []) as { id: string; order_id: string; user_id: string; attempts: number }[]) {
    await admin.database
      .from("fulfillment_jobs")
      .update({ status: "submitting", attempts: job.attempts + 1 })
      .eq("id", job.id);
    try {
      // Order + recipient.
      const { data: orderRows, error: oErr } = await admin.database
        .from("orders")
        .select("id, shipping_address, recipient_email")
        .eq("id", job.order_id)
        .limit(1);
      if (oErr) throw oErr;
      const order = (orderRows as { id: string; shipping_address: ShippingAddress | null; recipient_email: string | null }[])[0];
      if (!order) throw new Error("order not found");
      if (!order.shipping_address) throw new Error("order has no shipping address");

      // Items + variant mapping + design image.
      const { data: itemRows, error: iErr } = await admin.database
        .from("order_items")
        .select("variant_id, design_id, qty")
        .eq("order_id", job.order_id);
      if (iErr) throw iErr;
      const items = (itemRows as { variant_id: string; design_id: string | null; qty: number }[]) ?? [];
      if (!items.length) throw new Error("order has no items");

      const variantIds = [...new Set(items.map((i) => i.variant_id))];
      const designIds = [...new Set(items.map((i) => i.design_id).filter((d): d is string => !!d))];
      const { data: variants } = await admin.database
        .from("variants")
        .select("id, sku, printful_variant_id")
        .in("id", variantIds);
      const vmap = new Map((variants as { id: string; sku: string; printful_variant_id: number | null }[] ?? []).map((v) => [v.id, v]));
      const dmap = new Map<string, string>();
      if (designIds.length) {
        const { data: designs } = await admin.database.from("designs").select("id, image_url").in("id", designIds);
        for (const d of (designs as { id: string; image_url: string }[] ?? [])) dmap.set(d.id, d.image_url);
      }

      const input: FulfillInput = {
        orderId: order.id,
        recipient: { ...order.shipping_address, email: order.recipient_email },
        items: items.map((i) => ({
          printfulVariantId: vmap.get(i.variant_id)?.printful_variant_id ?? null,
          qty: i.qty,
          imageUrl: i.design_id ? dmap.get(i.design_id) ?? null : null,
          name: vmap.get(i.variant_id)?.sku,
        })),
      };

      const { result, provider } = await submitOrder(input);
      await admin.database
        .from("orders")
        .update({ provider, provider_order_id: result.providerOrderId, status: result.status })
        .eq("id", order.id);
      await admin.database
        .from("fulfillment_jobs")
        .update({ status: "submitted", last_error: null })
        .eq("id", job.id);
      results.push({ orderId: order.id, ok: true, detail: `${provider}:${result.providerOrderId}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.database.from("fulfillment_jobs").update({ status: "failed", last_error: msg }).eq("id", job.id);
      results.push({ orderId: job.order_id, ok: false, detail: msg });
    }
  }

  return json({ drained: results.length, results });
}
