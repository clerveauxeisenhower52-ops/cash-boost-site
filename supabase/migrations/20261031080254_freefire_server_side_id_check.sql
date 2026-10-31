-- Table de traces de vérification Free Fire.
-- Reconstituée à partir du schéma actuellement déployé (lecture seule).
create table if not exists public.freefire_player_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  player_id text not null,
  status text not null constraint freefire_player_checks_status_check
    check (status in ('valid', 'invalid', 'not_recognized', 'unavailable')),
  region text,
  player_name text,
  created_at timestamptz not null default now()
);

create index if not exists freefire_player_checks_lookup
  on public.freefire_player_checks (user_id, player_id, created_at desc, id desc);

alter table public.freefire_player_checks enable row level security;
revoke all on table public.freefire_player_checks from anon, authenticated;

-- ATTENTION : le CHECK reflète exactement l'état observé en production.
-- La fonction freefire-validate envoie aussi le statut 'wrong_region', non autorisé
-- par ce CHECK : cette trace échoue actuellement. Ne pas élargir la contrainte sans validation.
