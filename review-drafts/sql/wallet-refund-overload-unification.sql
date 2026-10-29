-- REVIEW DRAFT ONLY — DO NOT APPLY TO PRODUCTION WITHOUT REVIEW
-- Goal: make the text overload used by orders_refund_wallet() delegate to the
-- existing UUID implementation, so refund safeguards are consistent.
-- This file has NOT been executed against Supabase.

BEGIN;

CREATE OR REPLACE FUNCTION public.wallet_refund_order(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $draft$
DECLARE
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_purchase public.wallet_transactions%ROWTYPE;
  v_refunded boolean;
  v_balance numeric;
BEGIN
  -- Reject malformed IDs before casting.
  BEGIN
    v_order_id := btrim(p_order_id)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_order_id');
  END;

  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = v_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'order_not_found');
  END IF;

  -- Only wallet-funded orders may be refunded by this path.
  IF v_order.payment_method IS DISTINCT FROM 'Solde' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_wallet_payment');
  END IF;

  -- Keep the text overload aligned with the UUID implementation's purchase lookup.
  SELECT *
    INTO v_purchase
    FROM public.wallet_transactions
   WHERE user_id = v_order.user_id
     AND type = 'purchase'
     AND (order_id = v_order_id::text OR reference = 'order:' || v_order_id::text)
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND OR COALESCE(v_purchase.amount_htg, 0) >= 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_purchase');
  END IF;

  -- Idempotency check before delegating, matching either canonical refund key.
  IF EXISTS (
    SELECT 1
      FROM public.wallet_transactions r
     WHERE r.type = 'refund'
       AND (r.order_id = v_order_id::text OR r.reference = 'order:' || v_order_id::text)
  ) THEN
    SELECT w.balance
      INTO v_balance
      FROM public.wallets w
     WHERE w.user_id = v_order.user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_refunded',
      'balance', v_balance
    );
  END IF;

  v_refunded := public.wallet_refund_order(v_order_id);

  IF NOT v_refunded THEN
    RETURN jsonb_build_object('ok', false, 'status', 'refund_not_applied');
  END IF;

  SELECT w.balance
    INTO v_balance
    FROM public.wallets w
   WHERE w.user_id = v_order.user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'refunded',
    'balance', v_balance
  );
END;
$draft$;

COMMIT;

-- Review notes:
-- 1. This preserves the existing text signature and return type, so the
--    orders_refund_wallet() trigger dependency remains intact.
-- 2. The UUID overload remains the canonical implementation for wallet balance
--    locking, duplicate-refund checks, and refund insertion.
-- 3. Test in a disposable/staging database first, including concurrent updates,
--    missing wallet rows, malformed IDs, non-Solde orders, and existing refunds.
-- 4. Confirm the actual wallets table balance column and wallet_transactions
--    amount column names/types before applying. This draft assumes the catalog
--    previously inspected: wallets.balance and wallet_transactions.amount_htg.
-- 5. This migration is only a proposal. No live SQL, wallet balance, refund,
--    transfer, deployed function, or production configuration was changed.
