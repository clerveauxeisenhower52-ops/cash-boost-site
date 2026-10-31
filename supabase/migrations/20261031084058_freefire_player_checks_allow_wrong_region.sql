-- Autorise le statut 'wrong_region' écrit par freefire-validate et lu par freefire_purchase.
-- Appliquée sur la base le 31-10-2026. Aucune donnée existante concernée.
alter table public.freefire_player_checks
  drop constraint if exists freefire_player_checks_status_check;

alter table public.freefire_player_checks
  add constraint freefire_player_checks_status_check
  check (status in ('valid', 'invalid', 'not_recognized', 'unavailable', 'wrong_region'));
