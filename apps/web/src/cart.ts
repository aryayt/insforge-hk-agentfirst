/**
 * Cart domain logic — pure, framework-free, unit-tested (cart.test.ts).
 * The cart lives client-side (localStorage); only checkout touches the backend.
 */

export type Design = {
  text?: string;
  textColor?: string;
  artUrl?: string; // data URL / remote URL of the chosen or generated artwork
  artLabel?: string; // human label, e.g. "AI: a howling wolf" or "upload: logo.png"
};

export type CartItem = {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  productType: "tshirt" | "mug" | "cap";
  color: string;
  size: string | null;
  unitPriceCents: number;
  stripePriceId: string;
  qty: number;
  design?: Design;
};

/** Stable identity for merging: same variant + same design = same line. */
export const lineKey = (i: Pick<CartItem, "sku" | "design">): string =>
  `${i.sku}::${i.design ? JSON.stringify(i.design) : ""}`;

export const lineTotalCents = (i: CartItem): number => i.unitPriceCents * i.qty;

export const cartSubtotalCents = (items: CartItem[]): number =>
  items.reduce((sum, i) => sum + lineTotalCents(i), 0);

export const cartCount = (items: CartItem[]): number =>
  items.reduce((sum, i) => sum + i.qty, 0);

export function addItem(items: CartItem[], item: CartItem): CartItem[] {
  const key = lineKey(item);
  const existing = items.find((i) => lineKey(i) === key);
  if (existing) {
    return items.map((i) =>
      lineKey(i) === key ? { ...i, qty: i.qty + item.qty } : i,
    );
  }
  return [...items, item];
}

export function setQty(items: CartItem[], key: string, qty: number): CartItem[] {
  if (qty <= 0) return removeItem(items, key);
  return items.map((i) => (lineKey(i) === key ? { ...i, qty } : i));
}

export function removeItem(items: CartItem[], key: string): CartItem[] {
  return items.filter((i) => lineKey(i) !== key);
}
