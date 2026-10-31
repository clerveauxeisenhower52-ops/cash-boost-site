create or replace function public.pubg_purchase(
  p_request_id uuid,
  p_pack_id text,
  p_player_id text,
  p_phone text default null,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n int; v_owner uuid; v_prev jsonb;
  v_svc record; v_pack record; v_cost numeric;
  v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  v_pid text := regexp_replace(coalesce(p_player_id,''), '\s', '', 'g');
  v_bal numeric; v_new numeric; v_name text; v_email text; v_order_id text; v_res jsonb;
  v_chk text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'status', 'unauthenticated');
  end if;
  if p_request_id is null or p_pack_id is null or v_pid !~ '^[0-9]{5,20}$' or length(v_phone) < 11 then
    return jsonb_build_object('ok', false, 'status', 'invalid_input');
  end if;
  if p_confirmed is not true then
    return jsonb_build_object('ok', false, 'status', 'confirmation_required');
  end if;

  insert into wallet_purchase_requests (request_id, user_id) values (p_request_id, v_uid)
    on conflict (request_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    select user_id, result into v_owner, v_prev from wallet_purchase_requests where request_id = p_request_id;
    if v_owner is distinct from v_uid then
      return jsonb_build_object('ok', false, 'status', 'invalid_input');
    end if;
    return coalesce(v_prev, '{}'::jsonb) || jsonb_build_object('duplicate', true);
  end if;

  -- Exige une verification serveur recente du meme ID PUBG avant tout debit.
  select status into v_chk from pubg_player_checks
   where user_id = v_uid and player_id = v_pid and created_at > now() - interval '30 minutes'
   order by created_at desc, id desc limit 1;
  if v_chk is null then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', 'id_not_verified');
  end if;
  if v_chk in ('invalid', 'wrong_region') then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', case when v_chk = 'wrong_region' then 'wrong_region' else 'player_not_found' end);
  end if;
  if v_chk <> 'valid' then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', 'verification_unavailable');
  end if;

  select id, active into v_svc from services where id = 'PUBG Mobile (Auto)';
  if not found or v_svc.active is not true then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', 'service_unavailable');
  end if;

  select * into v_pack from pubg_packs where id = p_pack_id and active is true;
  if not found then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', 'service_unavailable');
  end if;
  select cost_usd into v_cost from pubg_pack_costs where pack_id = v_pack.id;
  if v_cost is null or v_cost <= 0 then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', 'service_unavailable');
  end if;

  select balance_htg into v_bal from wallets where user_id = v_uid for update;
  if not found or v_bal < v_pack.price_htg then
    delete from wallet_purchase_requests where request_id = p_request_id;
    return jsonb_build_object('ok', false, 'status', 'insufficient_funds',
      'balance', coalesce(v_bal, 0), 'total', v_pack.price_htg);
  end if;

  select full_name into v_name from profiles where id = v_uid;
  select email into v_email from auth.users where id = v_uid;

  perform set_config('app.wallet_purchase', '1', true);
  insert into orders (user_id, amount_usd, total_htg, merutag, service, customer_phone,
    customer_email, full_name, payment_method, payment_ref, pack_id, confirmed_at)
  values (v_uid, coalesce(v_cost, 0.01), v_pack.price_htg, v_pid,
    'PUBG Mobile (Auto)', v_phone, v_email, coalesce(v_name, v_email), 'Solde',
    'wallet-' || gen_random_uuid()::text, v_pack.id, now())
  returning id::text into v_order_id;
  perform set_config('app.wallet_purchase', '', true);

  update wallets set balance_htg = balance_htg - v_pack.price_htg, updated_at = now()
    where user_id = v_uid returning balance_htg into v_new;
  insert into wallet_transactions (user_id, type, amount_htg, balance_after, provider, reference, order_id)
    values (v_uid, 'purchase', -v_pack.price_htg, v_new, 'Solde', 'order:' || v_order_id, v_order_id);

  v_res := jsonb_build_object('ok', true, 'status', 'paid', 'order_id', v_order_id,
    'total', v_pack.price_htg, 'balance', v_new);
  update wallet_purchase_requests set result = v_res where request_id = p_request_id;
  return v_res;
end $function$;
