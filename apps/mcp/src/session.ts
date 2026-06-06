/**
 * Per-caller, in-memory session state (designs + cart) for the no-auth demo.
 *
 * ChatGPT shares ONE MCP transport session across all users; we scope state by
 * `ctx.client.user()?.subject` (stable per ChatGPT account), falling back to
 * conversationId, then a shared bucket for Inspector/CLI testing.
 *
 * Deliberately ephemeral: a server restart clears carts. Orders, designs
 * artwork (Storage), and payments are durable. Good enough for the hackathon;
 * the authenticated v1 moves carts to the `carts`/`cart_items` tables.
 */

export type SessionDesign = {
  id: string;
  label: string;
  prompt?: string;
  imageUrl: string;
  imageKey?: string;
  createdAt: number;
};

export type SessionCartItem = {
  variantId: string;
  sku: string;
  productLabel: string; // e.g. "Classic Tee — Black / L"
  stripePriceId: string | null;
  designId?: string;
  designLabel?: string;
  designUrl?: string;
  qty: number;
  unitPriceCents: number;
};

type SessionState = {
  designs: Map<string, SessionDesign>;
  cart: SessionCartItem[];
  lastOrderId?: string;
};

const sessions = new Map<string, SessionState>();

/** Derive a session key from the mcp-use tool context (2nd cb arg). */
export function sessionKey(ctx: unknown): string {
  const c = ctx as
    | { client?: { user?: () => { subject?: string; conversationId?: string } | undefined } }
    | undefined;
  const user = c?.client?.user?.();
  return user?.subject ?? user?.conversationId ?? "shared";
}

export function getSession(key: string): SessionState {
  let s = sessions.get(key);
  if (!s) {
    s = { designs: new Map(), cart: [] };
    sessions.set(key, s);
  }
  return s;
}

export function cartTotalCents(cart: SessionCartItem[]): number {
  return cart.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);
}
