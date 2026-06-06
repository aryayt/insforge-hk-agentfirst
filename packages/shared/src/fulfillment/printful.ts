import type {
  FulfillmentInput,
  FulfillmentProvider,
  StatusEvent,
  SubmitResult,
} from "./types";

/**
 * Printful API v1 fulfillment. Auth is a single private token (Developer Portal →
 * Your tokens): `Authorization: Bearer <token>`. v1 `/orders` is the stable target
 * (v2 is still beta). Docs: https://developers.printful.com/docs/
 */
export interface PrintfulConfig {
  apiKey: string;
  /** Account-level tokens require a store id header; store-level tokens don't. */
  storeId?: string;
  /**
   * false (default) creates a free, unfulfilled DRAFT order — safe for testing.
   * true submits for fulfillment, which charges your Printful billing.
   */
  confirm?: boolean;
  /** Override for tests. */
  baseUrl?: string;
  /** Inject a fetch (tests / Deno). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export const PRINTFUL_BASE_URL = "https://api.printful.com";

/** Build the v1 `POST /orders` body. Pure (no I/O) so it's trivially testable. */
export function buildPrintfulOrderBody(input: FulfillmentInput, confirm: boolean) {
  const unmapped = input.items.filter((i) => i.printfulVariantId == null);
  if (unmapped.length > 0) {
    const names = unmapped.map((i) => i.name ?? "item").join(", ");
    throw new Error(
      `Cannot submit order ${input.orderId} to Printful: ${unmapped.length} item(s) have no printful_variant_id (${names}). Map variants first (scripts/printful/map-variants.ts).`,
    );
  }
  const r = input.recipient;
  return {
    confirm,
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
}

/**
 * Parse a Printful webhook payload into a terminal order status, or null if it's not a
 * status event we act on. Pure (no I/O) so it's testable and reusable by the edge fn.
 * Event shapes: https://developers.printful.com/docs/#tag/Webhook-API
 */
export function parsePrintfulWebhook(payload: unknown): StatusEvent | null {
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

export function createPrintfulProvider(config: PrintfulConfig): FulfillmentProvider {
  const baseUrl = config.baseUrl ?? PRINTFUL_BASE_URL;
  const doFetch = config.fetchImpl ?? fetch;
  const confirm = config.confirm ?? false;

  return {
    name: "printful",

    async submitOrder(input: FulfillmentInput): Promise<SubmitResult> {
      const body = buildPrintfulOrderBody(input, confirm);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      };
      if (config.storeId) headers["X-PF-Store-Id"] = config.storeId;

      const res = await doFetch(`${baseUrl}/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        result?: { id?: number | string };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(
          `Printful POST /orders failed (${res.status}): ${json?.error?.message ?? "unknown error"}`,
        );
      }
      const id = json?.result?.id;
      if (id == null) throw new Error("Printful POST /orders returned no order id");

      // A draft (confirm:false) or freshly confirmed order is accepted but not yet shipped.
      // Keep orders.status='paid'; the printful-webhook advances it to fulfilled/failed.
      return { providerOrderId: String(id), status: "paid" };
    },

    parseStatusWebhook: parsePrintfulWebhook,
  };
}
