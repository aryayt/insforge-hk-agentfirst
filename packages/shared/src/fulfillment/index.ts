import { createMockProvider } from "./mock";
import { createPrintfulProvider } from "./printful";
import type { FulfillmentProvider } from "./types";

export * from "./types";
export {
  PRINTFUL_BASE_URL,
  buildPrintfulOrderBody,
  createPrintfulProvider,
  parsePrintfulWebhook,
} from "./printful";
export type { PrintfulConfig } from "./printful";
export { createMockProvider } from "./mock";

/** The subset of process.env / Deno env the factory reads. Passed in so it works in both. */
export interface FulfillmentEnv {
  PRINTFUL_API_KEY?: string;
  PRINTFUL_STORE_ID?: string;
  /** "true" submits real (charged) orders; anything else creates free drafts. */
  PRINTFUL_CONFIRM_ORDERS?: string;
  /** Optional override: "printful" | "mock". Defaults to printful-when-key-present. */
  FULFILLMENT_PROVIDER?: string;
}

/**
 * Pick the fulfillment provider from env: Printful when a key is present (or explicitly
 * forced), otherwise the mock fallback. Env is passed in (not read from process) so the
 * same code runs in the MCP server (Node/bun) and in mirrored Deno edge functions.
 */
export function getFulfillmentProvider(
  env: FulfillmentEnv,
  log?: (msg: string) => void,
): FulfillmentProvider {
  const forced = env.FULFILLMENT_PROVIDER?.toLowerCase();
  const useMock = forced === "mock" || (forced !== "printful" && !env.PRINTFUL_API_KEY);
  if (useMock) return createMockProvider(log);
  return createPrintfulProvider({
    apiKey: env.PRINTFUL_API_KEY as string,
    storeId: env.PRINTFUL_STORE_ID,
    confirm: env.PRINTFUL_CONFIRM_ORDERS === "true",
  });
}
