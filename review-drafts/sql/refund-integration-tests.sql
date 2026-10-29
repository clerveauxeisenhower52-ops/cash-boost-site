\set ON_ERROR_STOP on
DO $test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_other_user uuid := gen_random_uuid();
  v_other_order uuid := gen_random_uuid();
  v_result jsonb;
  v_count integer;
  v_balance numeric;
BEGIN
  INSERT INTO auth.users(id) VALUES(v_user), (v_other_user);

  -- Valid direct refund and duplicate idempotency.
  INSERT INTO wallets(user_id,balance_htg) VALUES(v_user, 500);
  INSERT INTO orders(id,user_id,total_htg,payment_method,status)
    VALUES(v_order,v_user,100,'Solde','en attente');
  INSERT INTO wallet_transactions(user_id,type,amount_htg,balance_after,provider,reference,order_id)
    VALUES(v_user,'purchase',-100,400,'Solde','order:'||v_order::text,v_order::text);

  v_result := public.wallet_refund_order(v_order::text);
  IF v_result->>'status' <> 'refunded' OR v_result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'valid refund failed: %', v_result;
  END IF;
  SELECT balance_htg INTO v_balance FROM wallets WHERE user_id=v_user;
  IF v_balance <> 600 THEN RAISE EXCEPTION 'wrong balance after refund: %', v_balance; END IF;

  v_result := public.wallet_refund_order(v_order::text);
  IF v_result->>'status' <> 'already_refunded' THEN
    RAISE EXCEPTION 'duplicate refund not idempotent: %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM wallet_transactions WHERE type='refund' AND order_id=v_order::text;
  IF v_count <> 1 THEN RAISE EXCEPTION 'duplicate refund rows: %', v_count; END IF;

  -- Malformed ID and non-wallet order are rejected.
  v_result := public.wallet_refund_order('not-a-uuid');
  IF v_result->>'status' <> 'invalid_order_id' THEN RAISE EXCEPTION 'bad ID accepted: %', v_result; END IF;

  INSERT INTO orders(id,user_id,total_htg,payment_method,status)
    VALUES(v_other_order,v_other_user,50,'NatCash','en attente');
  v_result := public.wallet_refund_order(v_other_order::text);
  IF v_result->>'status' <> 'not_wallet_payment' THEN RAISE EXCEPTION 'non-Solde order accepted: %', v_result; END IF;

  -- Trigger chain: BEFORE trigger refunds, AFTER text overload must not double-credit.
  INSERT INTO wallets(user_id,balance_htg) VALUES(v_other_user, 200);
  UPDATE orders SET payment_method='Solde' WHERE id=v_other_order;
  INSERT INTO wallet_transactions(user_id,type,amount_htg,balance_after,provider,reference,order_id)
    VALUES(v_other_user,'purchase',-50,150,'Solde','order:'||v_other_order::text,v_other_order::text);
  UPDATE orders SET status='rejetée' WHERE id=v_other_order;
  SELECT balance_htg INTO v_balance FROM wallets WHERE user_id=v_other_user;
  IF v_balance <> 250 THEN RAISE EXCEPTION 'trigger double-credit or missed refund, balance=%', v_balance; END IF;
  SELECT count(*) INTO v_count FROM wallet_transactions WHERE type='refund' AND order_id=v_other_order::text;
  IF v_count <> 1 THEN RAISE EXCEPTION 'trigger created % refunds, expected 1', v_count; END IF;

  RAISE NOTICE 'PASS: valid refund, duplicate, malformed ID, non-Solde, trigger single-credit';
END;
$test$;
