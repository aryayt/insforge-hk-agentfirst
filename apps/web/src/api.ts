/** All backend access for the storefront — InsForge SDK (anon client). */
import type { Product, Variant } from "@app/shared";
import { insforge } from "./insforge";
import type { CartItem } from "./cart";

const GUEST_KEY = "agentshop_guest";

/** Stable per-browser identity so a guest can see their own orders. */
export function guestToken(): string {
  let t = localStorage.getItem(GUEST_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(GUEST_KEY, t);
  }
  return t;
}

type VariantRow = {
  id: string;
  product_id: string;
  color: string;
  size: string | null;
  sku: string;
  price_delta_cents: number;
  stripe_price_id: string | null;
};
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  type: Product["type"];
  description: string;
  base_price_cents: number;
  active: boolean;
};

function toVariant(r: VariantRow): Variant {
  return {
    id: r.id,
    productId: r.product_id,
    color: r.color,
    size: r.size,
    sku: r.sku,
    priceDeltaCents: r.price_delta_cents,
    stripePriceId: r.stripe_price_id,
  };
}

export async function fetchCatalog(): Promise<Product[]> {
  const { data: products, error: pErr } = await insforge.database
    .from("products")
    .select()
    .eq("active", true)
    .order("base_price_cents", { ascending: true });
  if (pErr) throw pErr;

  const { data: variants, error: vErr } = await insforge.database.from("variants").select();
  if (vErr) throw vErr;

  const vs = (variants as VariantRow[]).map(toVariant);
  return (products as ProductRow[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    description: p.description,
    basePriceCents: p.base_price_cents,
    active: p.active,
    variants: vs.filter((v) => v.productId === p.id),
  }));
}

/** Price of one variant = product base + variant delta. */
export const variantPriceCents = (product: Product, variant: Variant): number =>
  product.basePriceCents + (variant.priceDeltaCents ?? 0);

export type OrderRow = {
  id: string;
  status: string;
  amount_cents: number;
  guest_token: string | null;
  email: string | null;
  stripe_session_id: string | null;
  design_preview_url: string | null;
  created_at: string;
};
export type OrderItemRow = {
  id: string;
  order_id: string;
  variant_id: string;
  qty: number;
  unit_price_cents: number;
  product_label: string | null;
  design_label: string | null;
};

async function createGuestOrder(
  items: CartItem[],
  email: string | null,
): Promise<{ orderId: string; token: string }> {
  const token = guestToken();
  const orderId = crypto.randomUUID();
  const amount = items.reduce((s, i) => s + i.unitPriceCents * i.qty, 0);
  // Only persist remote (http) preview URLs — never multi-MB data URLs in Postgres.
  const preview =
    items.find((i) => i.design?.artUrl && /^https?:/.test(i.design.artUrl))?.design?.artUrl ?? null;

  const { error: oErr } = await insforge.database.from("orders").insert([
    {
      id: orderId,
      user_id: null,
      status: "pending",
      amount_cents: amount,
      guest_token: token,
      email,
      design_preview_url: preview,
    },
  ]);
  if (oErr) throw oErr;

  const rows = items.map((i) => ({
    id: crypto.randomUUID(),
    order_id: orderId,
    user_id: null,
    variant_id: i.variantId,
    qty: i.qty,
    unit_price_cents: i.unitPriceCents,
    product_label: `${i.productName} — ${i.color}${i.size ? ` / ${i.size}` : ""}`,
    design_label:
      i.design?.artLabel ?? (i.design?.text ? `text: "${i.design.text}"` : null),
  }));
  const { error: iErr } = await insforge.database.from("order_items").insert(rows);
  if (iErr) throw iErr;

  return { orderId, token };
}

/** Create the pending order, then redirect to Stripe Checkout (test mode). */
export async function startCheckout(items: CartItem[], email: string | null): Promise<void> {
  if (items.length === 0) throw new Error("Cart is empty");
  for (const i of items) {
    if (!i.stripePriceId) throw new Error(`Variant ${i.sku} has no Stripe price configured`);
  }
  const { orderId, token } = await createGuestOrder(items, email);
  const origin = window.location.origin;
  const lineItems = items.map((i) => ({ stripePriceId: i.stripePriceId, quantity: i.qty }));

  const { data, error } = await insforge.payments.createCheckoutSession("test", {
    mode: "payment",
    lineItems,
    successUrl: `${origin}/success?order=${orderId}&token=${token}`,
    cancelUrl: `${origin}/cart`,
    customerEmail: email,
    metadata: { order_id: orderId, guest_token: token },
    idempotencyKey: `order:${orderId}`,
  });
  if (error) throw error;
  const url = (data as any)?.checkoutSession?.url;
  if (!url) throw new Error("Checkout session created but no URL was returned");
  window.location.assign(url);
}

/** Demo-grade fulfillment: Stripe only redirects to successUrl after payment. */
export async function markOrderPaid(
  orderId: string,
  token: string,
  sessionId?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status: "paid" };
  if (sessionId) patch.stripe_session_id = sessionId;
  const { error } = await insforge.database
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("guest_token", token);
  if (error) throw error;
}

export async function getOrder(
  orderId: string,
  token: string,
): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
  const { data, error } = await insforge.database
    .from("orders")
    .select()
    .eq("id", orderId)
    .eq("guest_token", token)
    .limit(1);
  if (error) throw error;
  const order = (data as OrderRow[])[0];
  if (!order) return null;
  const { data: items, error: iErr } = await insforge.database
    .from("order_items")
    .select()
    .eq("order_id", orderId);
  if (iErr) throw iErr;
  return { order, items: items as OrderItemRow[] };
}

async function itemsForOrders(orderIds: string[]): Promise<OrderItemRow[]> {
  const all: OrderItemRow[] = [];
  for (const id of orderIds) {
    const { data } = await insforge.database.from("order_items").select().eq("order_id", id);
    if (data) all.push(...(data as OrderItemRow[]));
  }
  return all;
}

export async function listMyOrders(): Promise<Array<OrderRow & { items: OrderItemRow[] }>> {
  const token = guestToken();
  const { data, error } = await insforge.database
    .from("orders")
    .select()
    .eq("guest_token", token)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const orders = data as OrderRow[];
  const items = await itemsForOrders(orders.map((o) => o.id));
  return orders.map((o) => ({ ...o, items: items.filter((it) => it.order_id === o.id) }));
}

/** For the in-app "Data" view — recent guest orders straight from the DB. */
export async function listRecentOrders(limit = 20): Promise<OrderRow[]> {
  const { data, error } = await insforge.database
    .from("orders")
    .select()
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as OrderRow[];
}
