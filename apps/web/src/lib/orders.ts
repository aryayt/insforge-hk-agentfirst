import { insforge } from "./insforge";

export type OrderStatus = "pending" | "paid" | "fulfilled" | "failed" | "canceled";

export type OrderSummary = {
  id: string;
  status: OrderStatus;
  amountCents: number;
  providerOrderId: string | null;
};

/** Read one of the signed-in user's orders (owner-RLS protected). */
export async function fetchOrder(id: string): Promise<OrderSummary | null> {
  const { data, error } = await insforge.database
    .from("orders")
    .select("id, status, amount_cents, provider_order_id")
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  const r = (data as Array<{ id: string; status: OrderStatus; amount_cents: number; provider_order_id: string | null }>)[0];
  if (!r) return null;
  return { id: r.id, status: r.status, amountCents: r.amount_cents, providerOrderId: r.provider_order_id };
}

/** Cancel an order via the server (deletes the Printful order if still cancelable). */
export async function cancelOrder(id: string): Promise<OrderStatus> {
  const { data, error } = await insforge.functions.invoke("cancel-order", { body: { orderId: id } });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const res = data as { status?: OrderStatus; error?: string };
  if (res?.error) throw new Error(res.error);
  return res.status ?? "canceled";
}
