-- Payment → fulfillment bridge. InsForge's MANAGED Stripe webhook projects payments into
-- payments.payment_history; we react to a succeeded one-time payment by marking our order
-- paid and enqueuing a fulfillment_jobs row. We do NOT hand-roll a Stripe-signature webhook.
-- External side effects (the actual Printful call) happen in the fulfill-order edge function
-- draining the outbox, NOT in this trigger (keep SQL triggers side-effect-free + idempotent).
-- Runs as project_admin inside its own transaction (no BEGIN/COMMIT here).

CREATE OR REPLACE FUNCTION public.handle_payment_succeeded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, payments
AS $$
DECLARE
  v_order_id UUID;
  v_user_id  UUID;
BEGIN
  -- Only act on a succeeded one-time payment.
  IF NEW.type <> 'one_time_payment' OR NEW.status <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  -- Correlate the payment to our app order via the checkout session metadata we set
  -- in create_checkout ({ order_id }). Not one of ours / no metadata → ignore.
  SELECT (cs.metadata->>'order_id')::uuid
    INTO v_order_id
  FROM payments.checkout_sessions cs
  WHERE cs.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mark paid (idempotent: only the pending→paid transition fires once).
  UPDATE public.orders
     SET status = 'paid'
   WHERE id = v_order_id AND status = 'pending'
  RETURNING user_id INTO v_user_id;

  -- Already paid before (re-delivered event): still ensure the outbox row exists.
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM public.orders WHERE id = v_order_id;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Enqueue fulfillment. One row per order (unique index); re-delivery is a no-op.
  INSERT INTO public.fulfillment_jobs (order_id, user_id, status)
  VALUES (v_order_id, v_user_id, 'pending')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Fires whether payment_history rows arrive already-succeeded (INSERT) or transition (UPDATE).
-- Drop the trigger by dropping the function with CASCADE (per the payments skill).
CREATE TRIGGER on_payment_succeeded
AFTER INSERT OR UPDATE OF status ON payments.payment_history
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_succeeded();
