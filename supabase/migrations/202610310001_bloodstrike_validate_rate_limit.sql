-- Limite de demandes de vérification d'ID Blood Strike par client (protège le quota quotidien shop2topup).
-- 10 demandes / 10 minutes et 60 / 24 heures par client.
create table if not exists public.bloodstrike_validate_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists bloodstrike_validate_log_user_time_idx
  on public.bloodstrike_validate_log (user_id, created_at desc);
alter table public.bloodstrike_validate_log enable row level security;
revoke all on public.bloodstrike_validate_log from anon, authenticated;

create or replace function public.bloodstrike_validate_allow_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n10 integer;
  n24 integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.bloodstrike_validate_log
    where user_id = p_user_id and created_at < now() - interval '2 days';
  select count(*) into n10 from public.bloodstrike_validate_log
    where user_id = p_user_id and created_at > now() - interval '10 minutes';
  select count(*) into n24 from public.bloodstrike_validate_log
    where user_id = p_user_id and created_at > now() - interval '24 hours';
  if n10 >= 10 or n24 >= 60 then
    return false;
  end if;
  insert into public.bloodstrike_validate_log (user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.bloodstrike_validate_allow_request(uuid) from public, anon, authenticated;
grant execute on function public.bloodstrike_validate_allow_request(uuid) to service_role;
