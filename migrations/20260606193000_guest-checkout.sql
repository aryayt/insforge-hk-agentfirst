-- Guest (anonymous) checkout for the demo: orders without an end-user login.
-- TEST/demo posture — anon may create + read guest orders. Tighten (require auth,
-- or move writes behind an edge function) before any production use.

-- ── Allow guest orders (no auth.users row) ─────────────────────────────────
ALTER TABLE orders      ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE order_items ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS email              TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_token        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS design_preview_url TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_guest_token ON orders(guest_token);

-- Per-item snapshot so a guest order is self-describing without a designs row.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_label TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_label  TEXT;

-- ── RLS: anonymous guest access to guest rows only ─────────────────────────
CREATE POLICY orders_guest_insert ON orders
  FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY orders_guest_select ON orders
  FOR SELECT TO anon USING (user_id IS NULL);
CREATE POLICY orders_guest_update ON orders
  FOR UPDATE TO anon USING (user_id IS NULL) WITH CHECK (user_id IS NULL);

CREATE POLICY order_items_guest_insert ON order_items
  FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY order_items_guest_select ON order_items
  FOR SELECT TO anon USING (user_id IS NULL);

GRANT SELECT, INSERT, UPDATE ON orders      TO anon;
GRANT SELECT, INSERT         ON order_items TO anon;
