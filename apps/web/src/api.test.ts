import { describe, expect, test } from "bun:test";
import { buildGuestOrderInsert } from "./api";

describe("web checkout attribution", () => {
  test("buildGuestOrderInsert marks storefront orders as web-sourced guests", () => {
    const row = buildGuestOrderInsert({
      orderId: "order-1",
      token: "guest-1",
      amountCents: 200,
      email: "buyer@example.test",
      previewUrl: "https://cdn.example.test/design.png",
    });

    expect(row).toMatchObject({
      id: "order-1",
      user_id: null,
      status: "pending",
      amount_cents: 200,
      guest_token: "guest-1",
      email: "buyer@example.test",
      design_preview_url: "https://cdn.example.test/design.png",
      agent_source: "web",
    });
  });
});
