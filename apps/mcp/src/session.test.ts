import { describe, expect, test } from "bun:test";
import { cartTotalCents, removeCartLine, type SessionCartItem } from "./session";

const line = (overrides: Partial<SessionCartItem> = {}): SessionCartItem => ({
  variantId: "variant-tee-black-m",
  sku: "tee-black-m",
  productLabel: "Classic Tee - Black / M",
  stripePriceId: "price_tee_black_m",
  qty: 1,
  unitPriceCents: 200,
  ...overrides,
});

describe("session cart helpers", () => {
  test("removeCartLine removes a 1-based line number and returns the removed item", () => {
    const cart = [line(), line({ sku: "cap-navy", productLabel: "Dad Cap - Navy" })];

    const removed = removeCartLine(cart, 1);

    expect(removed?.sku).toBe("tee-black-m");
    expect(cart).toHaveLength(1);
    expect(cart[0]!.sku).toBe("cap-navy");
    expect(cartTotalCents(cart)).toBe(200);
  });

  test("removeCartLine returns null and leaves cart unchanged for invalid line numbers", () => {
    const cart = [line()];

    expect(removeCartLine(cart, 0)).toBeNull();
    expect(removeCartLine(cart, 2)).toBeNull();
    expect(cart).toHaveLength(1);
  });
});
