-- DRAFT ONLY — PUBG Mobile (Auto)
-- Apply only after reviewing the complete integration. This migration is not deployed.
-- Prices confirmed by the owner on 2026-10-29.

create table if not exists public.pubg_packs (
  id text primary key,
  label text not null,
  uc integer not null check (uc > 0),
  price_htg numeric(12,2) not null check (price_htg > 0),
  active boolean not null default false,
  sort integer not null default 0
);

create table if not exists public.pubg_pack_costs (
  pack_id text primary key references public.pubg_packs(id) on delete cascade,
  fazer_product text,
  fazer_offer_id text,
  cost_usd numeric(12,2) not null check (cost_usd > 0),
  updated_at timestamptz not null default now()
);

-- Add the service as hidden/inactive so the site cannot offer it before launch approval.
insert into public.services (id, name, description, delivery, field_label, field_placeholder,
  rate, effective_rate, min_qty, active, sort, visible, rate_tiers)
values ('PUBG Mobile (Auto)', 'PUBG Mobile — Recharge automatique',
  'Recharge PUBG Mobile UC', 'Livraison automatique après confirmation fournisseur',
  'ID joueur PUBG Mobile', 'Entre ton ID joueur',
  1, 1, 1, false, 90, false, '[]'::jsonb)
on conflict (id) do nothing;

insert into public.pubg_packs (id, label, uc, price_htg, active, sort) values
  ('pubg-60',   '60 UC',   60,   190,   false, 1),
  ('pubg-325',  '325 UC',  325,  900,   false, 2),
  ('pubg-660',  '660 UC',  660,  1700,  false, 3),
  ('pubg-1800', '1800 UC', 1800, 4100,  false, 4),
  ('pubg-3850', '3850 UC', 3850, 8350,  false, 5),
  ('pubg-8100', '8100 UC', 8100, 16000, false, 6)
on conflict (id) do update set
  label = excluded.label,
  uc = excluded.uc,
  price_htg = excluded.price_htg,
  sort = excluded.sort;
-- All packs intentionally remain inactive until FazerCards offer IDs and the
-- automatic refill path have been verified.

insert into public.pubg_pack_costs (pack_id, cost_usd) values
  ('pubg-60', 0.88),
  ('pubg-325', 4.39),
  ('pubg-660', 8.79),
  ('pubg-1800', 21.97),
  ('pubg-3850', 43.94),
  ('pubg-8100', 87.87)
on conflict (pack_id) do update set
  cost_usd = excluded.cost_usd,
  updated_at = now();

alter table public.pubg_packs enable row level security;
alter table public.pubg_pack_costs enable row level security;

drop policy if exists "pubg packs readable" on public.pubg_packs;
create policy "pubg packs readable" on public.pubg_packs
  for select to authenticated using (active = true);
-- No client-facing policy for cost data: costs are server-side only.

create or replace function public.pubg_purchase(
  p_request_id uuid,
  p_pack_id text,
  p_player_id text,
  p_phone text default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n int; v_owner uuid; v_prev jsonb;
  v_svc record; v_pack record; v_cost numeric;
  v_phone text := regexp_replace(coalesce(p_phone,''), '\\D', '', 'g');
  v_pid text := regexp_replace(coalesce(p_player_id,''), '\\s', '', 'g');
  v_bal numeric; v_new numeric; v_name text; v_email text; v_order_id text; v_res jsonb;
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

-- Required trigger change: the order guard must treat PUBG packs as fixed-price packs,
-- just like Free Fire, instead of recalculating their total from a generic USD rate.
create or replace function public.orders_enforce_server_values()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.services%rowtype;
  tier jsonb;
  tier_min numeric;
  best_min numeric := -1;
  best_rate numeric := null;
  applied numeric;
begin
  select * into s from public.services where id = new.service;
  if not found or s.active is not true then
    raise exception 'Service indisponible';
  end if;

  if new.service in ('Free Fire', 'PUBG Mobile (Auto)') then
    new.status := 'en attente';
    return new;
  end if;

  if new.amount_usd is null or new.amount_usd < s.min_qty then
    raise exception 'Montant minimum non atteint';
  end if;

  for tier in select * from jsonb_array_elements(coalesce(s.rate_tiers, '[]'::jsonb))
  loop
    tier_min := coalesce((tier->>'min')::numeric, 0);
    if new.amount_usd >= tier_min and tier_min > best_min then
      best_min := tier_min;
      best_rate := (tier->>'rate')::numeric;
    end if;
  end loop;

  applied := coalesce(nullif(best_rate, 0), s.effective_rate);
  new.total_htg := new.amount_usd * applied;
  new.status := 'en attente';
  return new;
end;
$function$;
