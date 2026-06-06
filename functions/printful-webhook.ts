// printful-webhook — public endpoint Printful posts order/package status events to. Maps the
// event to a terminal order status and flips orders.status by provider_order_id.
//
// Runs on Deno Subhosting (can't import @app/shared); the parse logic mirrors
// packages/shared/src/fulfillment/printful.ts (parsePrintfulWebhook) — keep them in sync.
// Note: Printful webhooks aren't signed; we match by provider_order_id only. Set the
// endpoint URL in Printful's dashboard (Settings → Webhooks).
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type StatusEvent = { providerOrderId: string; status: "fulfilled" | "failed" };

function parsePrintfulWebhook(payload: unknown): StatusEvent | null {
  const p = payload as { type?: string; data?: { order?: { id?: number | string } } };
  const id = p?.data?.order?.id;
  if (id == null || !p.type) return null;
  const providerOrderId = String(id);
  switch (p.type) {
    case "package_shipped":
    case "order_fulfilled":
      return { providerOrderId, status: "fulfilled" };
    case "order_failed":
    case "order_canceled":
    case "order_put_hold":
      return { providerOrderId, status: "failed" };
    default:
      return null;
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null);
  const event = parsePrintfulWebhook(payload);
  if (!event) return json({ ignored: true });

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL") as string,
    apiKey: Deno.env.get("INSFORGE_API_KEY") as string,
  });

  const { error } = await admin.database
    .from("orders")
    .update({ status: event.status })
    .eq("provider_order_id", event.providerOrderId);
  if (error) return json({ error: error.message ?? String(error) }, 500);

  return json({ ok: true, providerOrderId: event.providerOrderId, status: event.status });
}
