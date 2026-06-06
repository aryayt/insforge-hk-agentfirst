-- Commerce schema for the agent-first shop: catalog (public) + per-user designs/carts/orders.
-- Runs as project_admin inside its own transaction (no BEGIN/COMMIT here).

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog (public read, admin-managed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('tshirt', 'mug', 'cap')),
  description      TEXT NOT NULL DEFAULT '',
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color             TEXT NOT NULL,
  size              TEXT,
  sku               TEXT NOT NULL UNIQUE,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  stripe_price_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_variants_product_id ON variants(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Designs (per-user). Artwork bytes live in Storage; rows keep url + key.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE designs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL CHECK (source IN ('ai', 'upload', 'preset')),
  prompt     TEXT,
  image_url  TEXT NOT NULL,
  image_key  TEXT NOT NULL,
  placement  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_designs_user_id ON designs(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Carts + items (per-user). user_id denormalized onto cart_items for fast RLS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_carts_user_id ON carts(user_id);
-- At most one open cart per user.
CREATE UNIQUE INDEX uniq_open_cart_per_user ON carts(user_id) WHERE status = 'open';

CREATE TABLE cart_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id       UUID NOT NULL REFERENCES variants(id),
  design_id        UUID REFERENCES designs(id) ON DELETE SET NULL,
  qty              INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_cart_items_user_id ON cart_items(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Orders + items. Written by the trusted server (admin client) / Stripe webhook;
-- users get read-only access to their own.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  amount_cents      INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_stripe_session_id ON orders(stripe_session_id);

CREATE TABLE order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id       UUID NOT NULL REFERENCES variants(id),
  design_id        UUID REFERENCES designs(id) ON DELETE SET NULL,
  qty              INTEGER NOT NULL CHECK (qty > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_user_id ON order_items(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Catalog: anyone can read; only admin (migrations/admin client) writes.
CREATE POLICY "products public read" ON products
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "variants public read" ON variants
  FOR SELECT TO anon, authenticated USING (true);

-- Designs / carts / cart_items: full owner access.
CREATE POLICY "designs owner all" ON designs
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "carts owner all" ON carts
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "cart_items owner all" ON cart_items
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Orders / order_items: owner read only (server writes via admin client).
CREATE POLICY "orders owner read" ON orders
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "order_items owner read" ON order_items
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Privileges (policies filter rows; GRANTs allow the operation to run at all)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON products, variants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON designs, carts, cart_items TO authenticated;
GRANT SELECT ON orders, order_items TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at auto-maintenance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER variants_updated_at BEFORE UPDATE ON variants
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
