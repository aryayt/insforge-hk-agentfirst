import { randomUUID } from "node:crypto";

/**
 * Per-conversation cart for the agent surface.
 *
 * Carts in the DB are owner-scoped to an auth.users row, but the agent/ChatGPT
 * flow is a guest with no auth user — so the agent's cart lives here, keyed by an
 * opaque `cartId` the agent passes back between tool calls. This is intentionally
 * lightweight (single-instance, demo-grade). For multi-instance hosting, back it
 * with a `guest_carts` table or a KV store keyed by the same token.
 */
export type CartLine = {
  sku: string;
  /** "Classic Tee — White / M". */
  label: string;
  designId: string | null;
  designLabel: string | null;
  designPreviewUrl: string | null;
  qty: number;
  unitPriceCents: number;
  stripePriceId: string | null;
};

export type SessionCart = { id: string; lines: CartLine[] };

const carts = new Map<string, SessionCart>();

export function getCart(cartId: string): SessionCart | null {
  return carts.get(cartId) ?? null;
}

/** Add a line to an existing cart, or create a new cart if `cartId` is omitted. */
export function addLine(cartId: string | undefined, line: CartLine): SessionCart {
  const cart = (cartId && carts.get(cartId)) || { id: randomUUID(), lines: [] };
  // Merge identical (sku + design) lines instead of duplicating.
  const existing = cart.lines.find((l) => l.sku === line.sku && l.designId === line.designId);
  if (existing) existing.qty += line.qty;
  else cart.lines.push(line);
  carts.set(cart.id, cart);
  return cart;
}

export function clearCart(cartId: string): void {
  carts.delete(cartId);
}

export function cartTotalCents(cart: SessionCart): number {
  return cart.lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}
