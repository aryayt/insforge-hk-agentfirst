import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import type { Product } from "@app/shared";
import { fetchCatalog } from "./api";
import { useCart } from "./store";
import { Studio } from "./studio";
import { Catalog, CartPage, DataPage, OrdersPage, SuccessPage } from "./pages";

function Nav() {
  const cart = useCart();
  const link = "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-extrabold tracking-tight">🧵 Agent Shop</Link>
        <nav className="flex items-center gap-1">
          <Link to="/" className={link}>Shop</Link>
          <Link to="/data" className={link}>Data</Link>
          <Link to="/orders" className={link}>Orders</Link>
          <Link to="/cart" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
            Cart{cart.count ? ` · ${cart.count}` : ""}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function StudioRoute({ products }: { products: Product[] }) {
  const { slug } = useParams();
  const product = products.find((p) => p.slug === slug);
  if (products.length === 0) return <p>Loading…</p>;
  if (!product) return <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">Product not found. <Link to="/" className="underline">Back to shop</Link></div>;
  return <Studio product={product} />;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load catalog"));
  }, []);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            Couldn't reach the backend: {error}
          </div>
        )}
        <Routes>
          <Route path="/" element={<Catalog products={products} />} />
          <Route path="/design/:slug" element={<StudioRoute products={products} />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/data" element={<DataPage products={products} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
