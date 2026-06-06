-- Guest + agent commerce model.
--
-- The original schema scoped designs/carts/orders to an authenticated owner.
-- The product is agent-first (ChatGPT) and the web studio checks out as a guest,
-- so designs and orders must be authorable without an auth.users row. This
-- migration relaxes ownership to allow guests and adds the provenance/denormalized
-- columns the `generate-design` function and the Stripe checkout/fulfillment path
-- rely on. Idempotent so it can be re-applied to a fresh environment.

-- ─── designs: guest authorship + provenance ──────────────────────────────────
ALTER TABLE designs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS label        TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS session_key  TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS agent_source TEXT;

-- Anyone can read designs (the artwork is shown in the studio / chat and the
-- public `designs` bucket already exposes the bytes). Writes stay server-side
-- via the admin client in the edge function.
DROP POLICY IF EXISTS "designs_guest_select" ON designs;
CREATE POLICY "designs_guest_select" ON designs
  FOR SELECT TO anon USING (true);

-- ─── orders: guest identity + design artwork + agent provenance ──────────────
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email              TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_token        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name      TEXT;
-- Public URL of the design the printer fulfills against (never base64 in Stripe).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS design_preview_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_source       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_user_subject TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_locale       TEXT;

-- ─── order_items: denormalized labels so an order reads without joins ────────
ALTER TABLE order_items ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_label TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS design_label  TEXT;
