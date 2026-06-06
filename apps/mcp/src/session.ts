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
  productLabel: string; // e.g. "Classic Tee - Black / L"
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

export type CallerInfo = {
  sessionKey: string;
  /** MCP client name, e.g. "openai-mcp" (ChatGPT), "claude-ai", "mcp-use-inspector". */
  agentSource: string;
  /** Stable per-ChatGPT-account opaque id (advisory, not verified identity). */
  userSubject: string | null;
  locale: string | null;
};

type CtxShape = {
  client?: {
    info?: () => { name?: string; version?: string } | undefined;
    user?: () =>
      | { subject?: string; conversationId?: string; locale?: string }
      | undefined;
  };
};

/** Extract caller identity/attribution from the mcp-use tool context (2nd cb arg). */
export function callerInfo(ctx: unknown): CallerInfo {
  const c = ctx as CtxShape | undefined;
  let user: ReturnType<NonNullable<NonNullable<CtxShape["client"]>["user"]>> | undefined;
  let info: ReturnType<NonNullable<NonNullable<CtxShape["client"]>["info"]>> | undefined;
  try {
    user = c?.client?.user?.();
    info = c?.client?.info?.();
  } catch {
    /* non-conforming client */
  }
  return {
    sessionKey: user?.subject ?? user?.conversationId ?? "shared",
    agentSource: info?.name ?? "unknown-mcp-client",
    userSubject: user?.subject ?? null,
    locale: user?.locale ?? null,
  };
}

/** Derive a session key from the mcp-use tool context (2nd cb arg). */
export function sessionKey(ctx: unknown): string {
  return callerInfo(ctx).sessionKey;
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

export function removeCartLine(cart: SessionCartItem[], lineNumber: number): SessionCartItem | null {
  const index = Math.floor(lineNumber) - 1;
  if (index < 0 || index >= cart.length) return null;
  const [removed] = cart.splice(index, 1);
  return removed ?? null;
}
