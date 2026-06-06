// Unit coverage for the fulfillment provider layer (the no-key path that runs today).
// Run: bun test scripts/printful/fulfillment.test.ts
import { expect, test } from "bun:test";
import {
  buildPrintfulOrderBody,
  getFulfillmentProvider,
  parsePrintfulWebhook,
} from "../../packages/shared/src/fulfillment/index";

const recipient = {
  name: "Ada",
  address1: "1 Market St",
  address2: null,
  city: "San Francisco",
  state: "CA",
  country: "US",
  zip: "94105",
  email: "ada@example.com",
};

test("mock provider when no key; submitOrder returns mock_<orderId>", async () => {
  const p = getFulfillmentProvider({}, () => {});
  expect(p.name).toBe("mock");
  const r = await p.submitOrder({
    orderId: "ord_1",
    recipient,
    items: [{ printfulVariantId: null, qty: 1, imageUrl: null }],
  });
  expect(r.providerOrderId).toBe("mock_ord_1");
  expect(r.status).toBe("fulfilled");
});

test("printful provider selected when key present; forced mock overrides", () => {
  expect(getFulfillmentProvider({ PRINTFUL_API_KEY: "tok" }).name).toBe("printful");
  expect(getFulfillmentProvider({ PRINTFUL_API_KEY: "tok", FULFILLMENT_PROVIDER: "mock" }).name).toBe("mock");
});

test("buildPrintfulOrderBody throws a clear error on unmapped variants", () => {
  expect(() =>
    buildPrintfulOrderBody(
      { orderId: "ord_1", recipient, items: [{ printfulVariantId: null, qty: 1, imageUrl: null, name: "tee-blk-m" }] },
      false,
    ),
  ).toThrow(/printful_variant_id/);
});

test("buildPrintfulOrderBody maps mapped items + recipient to Printful shape", () => {
  const body = buildPrintfulOrderBody(
    { orderId: "ord_1", recipient, items: [{ printfulVariantId: 4012, qty: 2, imageUrl: "https://img/x.png" }] },
    false,
  );
  expect(body.confirm).toBe(false);
  expect(body.recipient.country_code).toBe("US");
  expect(body.recipient.state_code).toBe("CA");
  expect(body.items[0]).toEqual({ variant_id: 4012, quantity: 2, files: [{ url: "https://img/x.png" }] });
});

test("parsePrintfulWebhook maps event types to terminal statuses", () => {
  expect(parsePrintfulWebhook({ type: "package_shipped", data: { order: { id: 99 } } })).toEqual({
    providerOrderId: "99",
    status: "fulfilled",
  });
  expect(parsePrintfulWebhook({ type: "order_failed", data: { order: { id: 99 } } })).toEqual({
    providerOrderId: "99",
    status: "failed",
  });
  expect(parsePrintfulWebhook({ type: "some_other_event", data: { order: { id: 99 } } })).toBeNull();
  expect(parsePrintfulWebhook({})).toBeNull();
});
