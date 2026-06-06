-- Phase 2 fulfillment: map our catalog to a print-on-demand provider (Printful),
-- record provider order state + shipping on orders, and add an outbox the paid→submit
-- step drains. External side effects (calling Printful) go through fulfillment_jobs so
-- the SQL fulfillment trigger stays side-effect-free (see docs/BACKEND.md + payments skill).
-- Runs as project_admin inside its own transaction (no BEGIN/COMMIT here).

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog → provider mapping
-- ─────────────────────────────────────────────────────────────────────────────
-- Printful CATALOG variant id (NOT product id) for this SKU. Nullable: a variant with
-- no mapping can't be fulfilled by Printful (the fulfiller skips/fails it explicitly).
ALTER TABLE variants ADD COLUMN printful_variant_id INTEGER;

-- ─────────────────────────────────────────────────────────────────────────────
-- Orders: which provider fulfilled it, the provider's order id, and where it ships.
-- shipping_address is captured from the Stripe Checkout Session by the fulfillment
-- trigger; the provider needs a recipient to create an order.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN provider          TEXT;
ALTER TABLE orders ADD COLUMN provider_order_id TEXT;
ALTER TABLE orders ADD COLUMN shipping_address  JSONB;
ALTER TABLE orders ADD COLUMN recipient_email   TEXT;
CREATE INDEX idx_orders_provider_order_id ON orders(provider_order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fulfillment outbox. One row per order to submit to the provider. The fulfillment
-- trigger enqueues 'pending'; the fulfill-order edge function drains it and submits.
-- Written by the trusted server (admin client); users get read-only of their own.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE fulfillment_jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'submitting', 'submitted', 'failed')),
  attempts   INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One outbox row per order (idempotent enqueue from the trigger).
CREATE UNIQUE INDEX uniq_fulfillment_job_per_order ON fulfillment_jobs(order_id);
-- The drainer selects pending/failed jobs.
CREATE INDEX idx_fulfillment_jobs_status ON fulfillment_jobs(status);
CREATE INDEX idx_fulfillment_jobs_user_id ON fulfillment_jobs(user_id);

ALTER TABLE fulfillment_jobs ENABLE ROW LEVEL SECURITY;

-- Owner read only; the server writes via the admin client (which bypasses RLS).
CREATE POLICY "fulfillment_jobs owner read" ON fulfillment_jobs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON fulfillment_jobs TO authenticated;

CREATE TRIGGER fulfillment_jobs_updated_at BEFORE UPDATE ON fulfillment_jobs
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
