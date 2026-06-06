-- Real Printful fulfillment: schema, payment projection, and fulfillment outbox.
-- Idempotent so it can be safely applied to environments that already have some
-- of the columns or policies from manual/live iteration.

-- ─── variants: real fulfillment mapping ─────────────────────────────────────
ALTER TABLE variants
  ADD COLUMN IF NOT EXISTS printful_variant_id INTEGER;

-- ─── orders: provider + recipient details + cancelable status ───────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address JSONB,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'fulfilled', 'failed', 'canceled'));

CREATE INDEX IF NOT EXISTS idx_orders_agent_source ON orders(agent_source);
CREATE INDEX IF NOT EXISTS idx_orders_guest_token ON orders(guest_token);
CREATE INDEX IF NOT EXISTS idx_orders_provider_order_id ON orders(provider_order_id);

-- ─── guest order policies (live backend shape) ──────────────────────────────
DROP POLICY IF EXISTS "orders_guest_insert" ON orders;
CREATE POLICY "orders_guest_insert" ON orders
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "orders_guest_select" ON orders;
CREATE POLICY "orders_guest_select" ON orders
  FOR SELECT TO anon
  USING (user_id IS NULL);

DROP POLICY IF EXISTS "orders_guest_update" ON orders;
CREATE POLICY "orders_guest_update" ON orders
  FOR UPDATE TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "order_items_guest_insert" ON order_items;
CREATE POLICY "order_items_guest_insert" ON order_items
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "order_items_guest_select" ON order_items;
CREATE POLICY "order_items_guest_select" ON order_items
  FOR SELECT TO anon
  USING (user_id IS NULL);

-- ─── fulfillment outbox ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fulfillment_jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitting', 'submitted', 'failed')),
  attempts   INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fulfillment_job_per_order ON fulfillment_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_jobs_status ON fulfillment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_jobs_user_id ON fulfillment_jobs(user_id);

ALTER TABLE fulfillment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fulfillment_jobs owner read" ON fulfillment_jobs;
CREATE POLICY "fulfillment_jobs owner read" ON fulfillment_jobs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON fulfillment_jobs TO authenticated;

DROP TRIGGER IF EXISTS fulfillment_jobs_updated_at ON fulfillment_jobs;
CREATE TRIGGER fulfillment_jobs_updated_at BEFORE UPDATE ON fulfillment_jobs
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();

-- ─── Stripe payment projection → order fulfillment ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_payment_succeeded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'payments'
AS $function$
DECLARE
  v_order_id UUID;
  v_user_id  UUID;
BEGIN
  IF NEW.type <> 'one_time_payment' OR NEW.status <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  SELECT (cs.metadata->>'order_id')::uuid
    INTO v_order_id
  FROM payments.checkout_sessions cs
  WHERE cs.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders
     SET status = 'paid'
   WHERE id = v_order_id AND status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM public.orders WHERE id = v_order_id;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.fulfillment_jobs (order_id, user_id, status)
  VALUES (v_order_id, v_user_id, 'pending')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF to_regclass('payments.payment_history') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.triggers
      WHERE event_object_schema = 'payments'
        AND event_object_table = 'payment_history'
        AND trigger_name = 'on_payment_succeeded'
    ) THEN
      BEGIN
        EXECUTE $sql$
          CREATE TRIGGER on_payment_succeeded
          AFTER INSERT OR UPDATE ON payments.payment_history
          FOR EACH ROW EXECUTE FUNCTION public.handle_payment_succeeded()
        $sql$;
      EXCEPTION
        WHEN undefined_table OR insufficient_privilege THEN
          NULL;
      END;
    END IF;
  END IF;
END $$;
