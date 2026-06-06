import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Product } from "@app/shared";
import { money } from "./format";
import { useCart } from "./store";
import { lineKey } from "./cart";
import { ProductMockup } from "./mockup";
import {
  getOrder,
  listMyOrders,
  listRecentOrders,
  markOrderPaid,
  startCheckout,
  type OrderItemRow,
  type OrderRow,
} from "./api";

const card = "rounded-lg bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]";

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "paid"
      ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
      : status === "pending"
        ? "bg-[var(--warning-bg)] text-[var(--warning-ink)]"
        : "bg-[var(--surface-muted)] text-[var(--muted)]";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{status}</span>;
}

// ── Catalog ────────────────────────────────────────────────────────────────
export function Catalog({ products }: { products: Product[] }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-[var(--ink)]">Design your own merch</h1>
        <p className="max-w-2xl text-[var(--muted)]">Pick a product, make it yours, and check out through the same InsForge and Stripe loop the ChatGPT agent uses.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Link key={p.id} to={`/design/${p.slug}`} className={`${card} group transition-colors hover:bg-white focus-visible:bg-white`}>
            <div className="mx-auto w-2/3">
              <ProductMockup type={p.type} color={p.variants[0]?.color ?? "Black"} text="YOU" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold">{p.name}</h2>
                <p className="text-sm text-[var(--muted)]">{p.variants.length} variants</p>
              </div>
              <p className="font-semibold">from {money(p.basePriceCents)}</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-[var(--accent)] group-hover:underline">Customize product</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Cart ───────────────────────────────────────────────────────────────────
export function CartPage() {
  const cart = useCart();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      await startCheckout(cart.items, email.trim() || null); // redirects to Stripe
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className={card}>
        <p className="text-lg">Your cart is empty.</p>
        <Link to="/" className="mt-3 inline-block font-semibold text-[var(--accent)] underline">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        {cart.items.map((i) => {
          const k = lineKey(i);
          return (
            <div key={k} className={`${card} flex gap-4`}>
              <div className="w-24 shrink-0">
                <ProductMockup type={i.productType} color={i.color} artUrl={i.design?.artUrl} text={i.design?.text} textColor={i.design?.textColor} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold">{i.productName}</h3>
                    <p className="text-sm text-[var(--muted)]">{i.color}{i.size ? ` / ${i.size}` : ""}</p>
                    {i.design?.artLabel && <p className="text-xs text-[var(--muted)]">{i.design.artLabel}</p>}
                    {i.design?.text && <p className="text-xs text-[var(--muted)]">text: "{i.design.text}"</p>}
                  </div>
                  <p className="font-semibold">{money(i.unitPriceCents * i.qty)}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => cart.setQty(k, i.qty - 1)} className="h-8 w-8 rounded-md border border-[var(--line)]">-</button>
                  <span className="w-6 text-center">{i.qty}</span>
                  <button onClick={() => cart.setQty(k, i.qty + 1)} className="h-8 w-8 rounded-md border border-[var(--line)]">+</button>
                  <button onClick={() => cart.remove(k)} className="ml-3 text-sm font-semibold text-[var(--danger)] underline">Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`${card} h-fit`}>
        <div className="flex justify-between text-lg font-bold">
          <span>Subtotal</span>
          <span>{money(cart.subtotalCents)}</span>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">Taxes and shipping are calculated at checkout.</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for receipt (optional)"
          className="mt-4 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
        />
        <button
          onClick={checkout}
          disabled={busy}
          className="mt-3 w-full rounded-md bg-[var(--accent)] px-6 py-3 font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? "Redirecting to Stripe..." : "Start checkout"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-3 text-center text-xs text-[var(--muted)]">Stripe test mode, card 4242 4242 4242 4242</p>
      </div>
    </div>
  );
}

// ── Checkout success ─────────────────────────────────────────────────────────
export function SuccessPage() {
  const [params] = useSearchParams();
  const cart = useCart();
  const orderId = params.get("order");
  const token = params.get("token");
  const [state, setState] = useState<{ order: OrderRow; items: OrderItemRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!orderId || !token) {
        setError("Missing order reference.");
        return;
      }
      try {
        await markOrderPaid(orderId, token);
        const r = await getOrder(orderId, token);
        if (!r) setError("Order not found.");
        else setState(r);
        cart.clear();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load order");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, token]);

  if (error) return <div className={card}><p className="text-red-600">{error}</p><Link to="/" className="underline">Back to shop</Link></div>;
  if (!state) return <div className={card}>Finalizing your order...</div>;

  return (
    <div className={`${card} mx-auto max-w-xl text-center`}>
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-bg)] text-2xl text-[var(--success-ink)]">OK</div>
      <h1 className="text-2xl font-extrabold">Order confirmed</h1>
      <p className="text-[var(--muted)]">Your payment went through in Stripe test mode.</p>
      <div className="mt-5 space-y-2 text-left">
        {state.items.map((it) => (
          <div key={it.id} className="flex justify-between border-b border-[var(--line)] py-2">
            <span>{it.product_label}{it.design_label ? `, ${it.design_label}` : ""} x {it.qty}</span>
            <span className="font-semibold">{money(it.unit_price_cents * it.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 text-lg font-bold">
          <span>Total</span>
          <span>{money(state.order.amount_cents)}</span>
        </div>
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">Order {state.order.id}</p>
      <div className="mt-5 flex justify-center gap-3">
        <Link to="/" className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-white">Keep shopping</Link>
        <Link to="/orders" className="rounded-md border border-[var(--line)] px-4 py-2 font-semibold">View orders</Link>
      </div>
    </div>
  );
}

// ── My orders ────────────────────────────────────────────────────────────────
export function OrdersPage() {
  const [orders, setOrders] = useState<Array<OrderRow & { items: OrderItemRow[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyOrders().then(setOrders).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className={card}><p className="text-red-600">{error}</p></div>;
  if (!orders) return <div className={card}>Loading...</div>;
  if (orders.length === 0) return <div className={card}>No orders yet. <Link to="/" className="text-[var(--accent)] underline">Start designing</Link></div>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Your orders</h1>
      {orders.map((o) => (
        <div key={o.id} className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={o.status} />
              <span className="text-sm text-[var(--muted)]">{new Date(o.created_at).toLocaleString()}</span>
            </div>
            <span className="font-bold">{money(o.amount_cents)}</span>
          </div>
          <ul className="mt-2 text-sm text-[var(--muted)]">
            {o.items.map((it) => (
              <li key={it.id}>{it.product_label}{it.design_label ? `, ${it.design_label}` : ""} x {it.qty}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Live DB data view (the "see the data" answer) ───────────────────────────
export function DataPage({ products }: { products: Product[] }) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  useEffect(() => {
    listRecentOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Live data</h1>
        <p className="text-[var(--muted)]">Straight from InsForge project <code>dsc7y62h</code> through the anon SDK client. What you see is what's in Postgres.</p>
      </div>

      <div className={card}>
        <h2 className="mb-3 font-bold">Catalog ({products.length} products)</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--muted)]"><tr><th className="py-1">Product</th><th>Type</th><th>Base</th><th>Variants</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-[var(--line)]">
                <td className="py-1.5 font-medium">{p.name}</td>
                <td>{p.type}</td>
                <td>{money(p.basePriceCents)}</td>
                <td>{p.variants.map((v) => v.sku).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={card}>
        <h2 className="mb-3 font-bold">Recent orders {orders ? `(${orders.length})` : ""}</h2>
        {!orders ? (
          <p>Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-[var(--muted)]">No orders yet. Place one to see it appear here.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-1">When</th><th>Status</th><th>Amount</th><th>Order id</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[var(--line)]">
                  <td className="py-1.5">{new Date(o.created_at).toLocaleString()}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{money(o.amount_cents)}</td>
                  <td className="font-mono text-xs text-[var(--muted)]">{o.id.slice(0, 8)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
