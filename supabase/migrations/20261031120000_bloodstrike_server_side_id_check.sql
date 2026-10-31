-- Trace des vérifications d'ID joueur Blood Strike (écrite uniquement par la fonction bloodstrike-validate, via service_role).
create table if not exists public.bloodstrike_player_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  player_id text not null,
  status text not null check (status in ('valid','invalid','not_recognized','unavailable')),
  created_at timestamptz not null default now()
);
create index if not exists bloodstrike_player_checks_lookup
  on public.bloodstrike_player_checks (user_id, player_id, created_at desc);
alter table public.bloodstrike_player_checks enable row level security;
revoke all on table public.bloodstrike_player_checks from anon, authenticated;

-- blood_strike_purchase : après la gestion des requêtes dupliquées, refuse l'achat si l'ID n'a pas été vérifié
-- dans les 30 dernières minutes (id_not_verified) ou si le fournisseur a répondu « introuvable » (player_not_found).
-- Bloc ajouté dans la fonction (le reste est inchangé) :
--
--   select status into v_chk from bloodstrike_player_checks
--    where user_id = v_uid and player_id = v_pid and created_at > now() - interval '30 minutes'
--    order by created_at desc, id desc limit 1;
--   if v_chk is null then
--     delete from wallet_purchase_requests where request_id = p_request_id;
--     return jsonb_build_object('ok', false, 'status', 'id_not_verified');
--   end if;
--   if v_chk = 'invalid' then
--     delete from wallet_purchase_requests where request_id = p_request_id;
--     return jsonb_build_object('ok', false, 'status', 'player_not_found');
--   end if;
--
-- La définition complète de la fonction est appliquée dans la base (migration bloodstrike_server_side_id_check).
