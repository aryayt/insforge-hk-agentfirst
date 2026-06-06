import { expect, test, describe } from "bun:test";
import {
  addItem,
  cartCount,
  cartSubtotalCents,
  lineKey,
  lineTotalCents,
  removeItem,
  setQty,
  type CartItem,
} from "./cart";

const base: CartItem = {
  variantId: "v1",
  sku: "tee-blk-m",
  productSlug: "classic-tee",
  productName: "Classic Tee",
  productType: "tshirt",
  color: "Black",
  size: "M",
  unitPriceCents: 1999,
  stripePriceId: "price_1",
  qty: 1,
};

describe("cart pricing", () => {
  test("lineTotal multiplies unit price by qty", () => {
    expect(lineTotalCents({ ...base, qty: 3 })).toBe(5997);
  });

  test("subtotal sums all lines", () => {
    const items = [{ ...base, qty: 2 }, { ...base, sku: "mug-wht", unitPriceCents: 1299, qty: 1 }];
    expect(cartSubtotalCents(items)).toBe(1999 * 2 + 1299);
  });

  test("cartCount sums quantities", () => {
    expect(cartCount([{ ...base, qty: 2 }, { ...base, sku: "cap-blk", qty: 5 }])).toBe(7);
  });
});

describe("cart mutations", () => {
  test("addItem merges same sku + same design", () => {
    let items: CartItem[] = [];
    items = addItem(items, base);
    items = addItem(items, { ...base, qty: 2 });
    expect(items).toHaveLength(1);
    expect(items[0]!.qty).toBe(3);
  });

  test("addItem keeps different designs as separate lines", () => {
    let items: CartItem[] = [];
    items = addItem(items, { ...base, design: { text: "A" } });
    items = addItem(items, { ...base, design: { text: "B" } });
    expect(items).toHaveLength(2);
  });

  test("setQty updates a line, removes at zero", () => {
    let items = addItem([], base);
    const k = lineKey(base);
    items = setQty(items, k, 4);
    expect(items[0]!.qty).toBe(4);
    items = setQty(items, k, 0);
    expect(items).toHaveLength(0);
  });

  test("removeItem drops the matching line", () => {
    const items = addItem(addItem([], base), { ...base, sku: "cap-blk" });
    const after = removeItem(items, lineKey(base));
    expect(after).toHaveLength(1);
    expect(after[0]!.sku).toBe("cap-blk");
  });
});
