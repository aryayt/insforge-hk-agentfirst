import { useEffect, useState } from "react";
import { cancelOrder, fetchOrder, type OrderStatus } from "../lib/orders";
import { money } from "../lib/catalog";

const LABEL: Record<OrderStatus, string> = {
  pending: "Payment processing…",
  paid: "Paid — being prepared",
  fulfilled: "Shipped",
  failed: "Failed",
  canceled: "Canceled",
};
const TONE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  canceled: "bg-zinc-200 text-zinc-600",
};

/**
 * Post-checkout order panel: shows the order's status (polled briefly while payment
 * settles) and offers Cancel while it's still cancelable (pending/paid — before
 * Printful sends it to production).
 */
export function OrderStatusCard({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Poll until the order is readable AND settled. We keep retrying on a null read too:
  // right after the Stripe redirect the page reloads and auth rehydrates asynchronously,
  // so the first read can race ahead of the session token (RLS → 0 rows). Also poll
  // while still 'pending' so it flips to 'paid' as the webhook + trigger land.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      try {
        const o = await fetchOrder(orderId);
        if (cancelled) return;
        if (o) {
          setStatus(o.status);
          setAmountCents(o.amountCents);
          setLoadErr(null);
          if (o.status === "pending" && tries++ < 25) setTimeout(tick, 2000);
          return;
        }
      } catch {
        /* transient — fall through to retry */
      }
      if (cancelled) return;
      if (tries++ < 25) setTimeout(tick, 1500);
      else setLoadErr("Couldn't load this order — make sure you're signed in, then refresh.");
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function onCancel() {
    setBusy(true);
    setErr(null);
    try {
      setStatus(await cancelOrder(orderId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't cancel this order.");
    } finally {
      setBusy(false);
    }
  }

  const cancelable = status === "pending" || status === "paid";

  return (
    <div className="mx-auto mt-4 max-w-6xl px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status ? TONE[status] : loadErr ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500"}`}>
            {status ? LABEL[status] : loadErr ? "Couldn't load" : "Loading order…"}
          </span>
          <span className="text-sm text-zinc-500">
            Order <span className="font-mono text-zinc-700">{orderId.slice(0, 8)}</span>
            {amountCents != null && <> · {money(amountCents)}</>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(err || loadErr) && <span className="text-xs text-red-500">{err || loadErr}</span>}
          {cancelable && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {busy ? "Canceling…" : "Cancel order"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
