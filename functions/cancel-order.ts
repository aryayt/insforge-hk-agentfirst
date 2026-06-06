/**
 * cancel-order — InsForge edge function (Deno). Cancels a user's order: deletes the
 * Printful order (only possible while it's a draft/pending — not yet fulfilled/shipped)
 * and marks our order `canceled`. The browser can't write `orders` (RLS), so this runs
 * server-side with the admin client after verifying the caller owns the order.
 *
 * Secret: PRINTFUL_API_KEY. Auto-injected: API_KEY, ANON_KEY, INSFORGE_BASE_URL.
 *
 * Deploy:  bunx @insforge/cli functions deploy cancel-order --file functions/cancel-order.ts
 * Invoke:  insforge.functions.invoke('cancel-order', { body: { orderId } })
 */
import { createAdminClient, createClient } from "npm:@insforge/sdk";

declare const Deno: { env: { get(name: string): string | undefined } };

const PRINTFUL_BASE_URL = "https://api.printful.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function resolveUserId(req: Request): Promise<string | null> {
  const authz = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authz?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === Deno.env.get("ANON_KEY") || token === Deno.env.get("API_KEY")) return null;
  try {
    const user = createClient({
      baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
      edgeFunctionToken: token,
    });
    const { data, error } = await user.auth.getCurrentUser();
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }
  if (!body.orderId) return json(400, { error: "orderId required" });

  const userId = await resolveUserId(req);
  if (!userId) return json(401, { error: "Sign in to cancel an order." });

  const admin = createAdminClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL"), apiKey: Deno.env.get("API_KEY") });

  const { data: rows, error } = await admin.database
    .from("orders")
    .select("id, user_id, status, provider, provider_order_id")
    .eq("id", body.orderId)
    .eq("user_id", userId)
    .limit(1);
  if (error) return json(500, { error: "order lookup failed" });
  const order = (rows as Array<{ id: string; status: string; provider: string | null; provider_order_id: string | null }>)[0];
  if (!order) return json(404, { error: "Order not found." });

  if (order.status === "canceled") return json(200, { ok: true, status: "canceled" });
  if (order.status === "fulfilled") {
    return json(409, { error: "This order has already been fulfilled/shipped and can't be canceled here." });
  }

  if (order.provider === "printful" && order.provider_order_id) {
    const res = await fetch(`${PRINTFUL_BASE_URL}/orders/${order.provider_order_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${Deno.env.get("PRINTFUL_API_KEY")}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return json(409, {
        error: `Printful wouldn't cancel this order (${res.status}): ${j?.error?.message ?? "it may already be in production"}.`,
      });
    }
  }

  const { error: updErr } = await admin.database
    .from("orders")
    .update({ status: "canceled" })
    .eq("id", order.id);
  if (updErr) return json(500, { error: "could not mark order canceled" });

  await admin.database
    .from("fulfillment_jobs")
    .update({ status: "failed", last_error: "order canceled" })
    .eq("order_id", order.id)
    .in("status", ["pending", "failed"]);

  return json(200, { ok: true, status: "canceled" });
}
