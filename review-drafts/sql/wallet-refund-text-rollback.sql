-- ROLLBACK for the wallet_refund_order(text) unification migration.
-- Restores the original production definition (captured read-only on 2026-10-28).
-- Only the text overload changes; the uuid overload and both triggers are untouched.

CREATE OR REPLACE FUNCTION public.wallet_refund_order(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tx  record;
  v_bal numeric;
begin
  select user_id, amount_htg into v_tx
    from wallet_transactions where order_id = p_order_id and type = 'purchase';
  if not found then
    return jsonb_build_object('ok', false, 'status', 'no_purchase');
  end if;

  perform 1 from wallets where user_id = v_tx.user_id for update;

  if exists (select 1 from wallet_transactions where order_id = p_order_id and type = 'refund') then
    return jsonb_build_object('ok', true, 'status', 'already_refunded');
  end if;

  update wallets
     set balance_htg = balance_htg - v_tx.amount_htg, updated_at = now()   -- amount_htg est négatif
   where user_id = v_tx.user_id
   returning balance_htg into v_bal;

  insert into wallet_transactions (user_id, type, amount_htg, balance_after, provider, reference, order_id)
  values (v_tx.user_id, 'refund', -v_tx.amount_htg, v_bal, 'Solde', 'order:' || p_order_id, p_order_id);

  return jsonb_build_object('ok', true, 'status', 'refunded', 'balance', v_bal);
end $function$;
