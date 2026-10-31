-- Traces de vérification serveur des ID PUBG Mobile (lues par pubg_purchase avant tout débit).
create table if not exists public.pubg_player_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  player_id text not null,
  status text not null constraint pubg_player_checks_status_check
    check (status in ('valid', 'invalid', 'wrong_region', 'unavailable')),
  region text,
  player_name text,
  created_at timestamptz not null default now()
);

create index if not exists pubg_player_checks_lookup
  on public.pubg_player_checks (user_id, player_id, created_at desc, id desc);

alter table public.pubg_player_checks enable row level security;
revoke all on table public.pubg_player_checks from anon, authenticated;
