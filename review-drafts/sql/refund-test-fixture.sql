-- Disposable PostgreSQL fixture only. Never run against Supabase production.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  total_htg numeric NOT NULL DEFAULT 100,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'en attente',
  auto_validation_reason text
);

CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY,
  balance_htg numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount_htg numeric NOT NULL,
  balance_after numeric,
  provider text,
  reference text,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wallet_tx_one_refund ON public.wallet_transactions(order_id)
  WHERE type = 'refund' AND order_id IS NOT NULL;
CREATE UNIQUE INDEX wallet_tx_one_refund_per_order ON public.wallet_transactions(reference)
  WHERE type = 'refund' AND reference IS NOT NULL;

-- Mirrors the live UUID overload's refund safeguards for disposable integration tests.
CREATE OR REPLACE FUNCTION public.wallet_refund_order(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $fn$
DECLARE
  v_order record;
  v_ref text := 'order:' || p_order_id::text;
  v_amount numeric;
  v_balance numeric;
BEGIN
  SELECT id, user_id, total_htg, payment_method INTO v_order
    FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.payment_method IS DISTINCT FROM 'Solde' THEN RETURN false; END IF;

  SELECT abs(amount_htg) INTO v_amount FROM wallet_transactions
   WHERE user_id = v_order.user_id AND type = 'purchase'
     AND (order_id = p_order_id::text OR reference = v_ref)
   ORDER BY created_at DESC LIMIT 1;
  IF v_amount IS NULL OR v_amount <= 0 THEN RETURN false; END IF;

  PERFORM 1 FROM wallets WHERE user_id = v_order.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE type = 'refund'
      AND (reference = v_ref OR order_id = p_order_id::text)) THEN RETURN false; END IF;

  UPDATE wallets SET balance_htg = balance_htg + v_amount, updated_at = now()
    WHERE user_id = v_order.user_id RETURNING balance_htg INTO v_balance;
  INSERT INTO wallet_transactions(user_id,type,amount_htg,balance_after,provider,reference,order_id)
    VALUES(v_order.user_id,'refund',v_amount,v_balance,'Solde',v_ref,p_order_id::text);
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.orders_auto_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $fn$
BEGIN
  IF NEW.payment_method IS DISTINCT FROM 'Solde' THEN RETURN NEW; END IF;
  IF NEW.status = 'complétée' AND OLD.status IS DISTINCT FROM 'complétée'
     AND EXISTS (SELECT 1 FROM wallet_transactions
                  WHERE type='refund' AND reference='order:' || NEW.id::text) THEN
    RAISE EXCEPTION 'order_already_refunded';
  END IF;
  IF NEW.status = 'en attente'
     AND COALESCE(NEW.auto_validation_reason,'') ILIKE '%envoi USDT échoué%'
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.auto_validation_reason IS DISTINCT FROM NEW.auto_validation_reason) THEN
    IF public.wallet_refund_order(NEW.id) THEN
      NEW.status := 'rejetée';
      NEW.auto_validation_reason := COALESCE(NEW.auto_validation_reason,'')
        || ' · remboursé automatiquement sur le portefeuille';
    END IF;
  ELSIF NEW.status = 'rejetée'
     AND OLD.status IS DISTINCT FROM 'rejetée'
     AND OLD.status IS DISTINCT FROM 'complétée' THEN
    PERFORM public.wallet_refund_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.orders_refund_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $fn$
BEGIN
  IF NEW.payment_method='Solde' AND NEW.status='rejetée'
     AND OLD.status IS DISTINCT FROM 'rejetée'
     AND OLD.status IS DISTINCT FROM 'complétée' THEN
    PERFORM public.wallet_refund_order(NEW.id::text);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER orders_auto_refund_trg
BEFORE UPDATE OF status, auto_validation_reason ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_auto_refund();
CREATE TRIGGER orders_refund_wallet_trg
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_refund_wallet();
