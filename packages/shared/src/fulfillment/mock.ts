import type { FulfillmentInput, FulfillmentProvider, SubmitResult } from "./types";

/**
 * No-key fallback (honors the original D1 "mock fulfillment" decision). Logs the order it
 * would have submitted and marks it fulfilled immediately so the demo completes end-to-end
 * without a Printful token. No webhook will ever arrive for a mock order — that's expected.
 */
export function createMockProvider(
  log: (msg: string) => void = console.log,
): FulfillmentProvider {
  return {
    name: "mock",

    async submitOrder(input: FulfillmentInput): Promise<SubmitResult> {
      log(
        `[mock-fulfillment] order ${input.orderId}: ${input.items.length} item(s) → ` +
          `${input.recipient.city}, ${input.recipient.country} ` +
          `(${input.items.map((i) => `${i.qty}×${i.printfulVariantId ?? "unmapped"}`).join(", ")})`,
      );
      return { providerOrderId: `mock_${input.orderId}`, status: "fulfilled" };
    },

    parseStatusWebhook() {
      return null;
    },
  };
}
