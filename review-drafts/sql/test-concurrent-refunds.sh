#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD=tester
PSQL=(psql -h localhost -U tester -d refund_test -v ON_ERROR_STOP=1 -q)

USER_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ORDER_ID="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

"${PSQL[@]}" <<SQL
INSERT INTO auth.users(id) VALUES ('$USER_ID');
INSERT INTO wallets(user_id,balance_htg) VALUES ('$USER_ID',500);
INSERT INTO orders(id,user_id,total_htg,payment_method,status)
VALUES ('$ORDER_ID','$USER_ID',100,'Solde','en attente');
INSERT INTO wallet_transactions(user_id,type,amount_htg,balance_after,provider,reference,order_id)
VALUES ('$USER_ID','purchase',-100,400,'Solde','order:$ORDER_ID','$ORDER_ID');
SQL

# Separate PostgreSQL sessions race for the same refund.
pids=()
for i in $(seq 1 8); do
  "${PSQL[@]}" -c "SELECT public.wallet_refund_order('$ORDER_ID'::text);" >"/tmp/refund-race-$i.log" 2>&1 &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

"${PSQL[@]}" <<SQL
DO \$assert\$
DECLARE v_balance numeric; v_count integer;
BEGIN
  SELECT balance_htg INTO v_balance FROM wallets WHERE user_id='$USER_ID';
  SELECT count(*) INTO v_count FROM wallet_transactions WHERE type='refund' AND order_id='$ORDER_ID';
  IF v_balance <> 600 THEN RAISE EXCEPTION 'concurrent refund balance incorrect: %',v_balance; END IF;
  IF v_count <> 1 THEN RAISE EXCEPTION 'expected exactly one refund row, got %',v_count; END IF;
END;
\$assert\$;
SQL
echo "PASS: 8 concurrent refund attempts resulted in exactly one wallet credit and one refund row."
