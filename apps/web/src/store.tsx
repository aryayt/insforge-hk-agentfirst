import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  addItem as add,
  cartCount,
  cartSubtotalCents,
  lineKey,
  removeItem as remove,
  setQty as setQ,
  type CartItem,
} from "./cart";

const STORAGE_KEY = "agentshop_cart";

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  add: (item: CartItem) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      count: cartCount(items),
      subtotalCents: cartSubtotalCents(items),
      add: (item) => setItems((cur) => add(cur, item)),
      setQty: (key, qty) => setItems((cur) => setQ(cur, key, qty)),
      remove: (key) => setItems((cur) => remove(cur, key)),
      clear: () => setItems([]),
    }),
    [items],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}

export { lineKey };
