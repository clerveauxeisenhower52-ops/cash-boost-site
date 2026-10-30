-- Cash Boost wallet PIN security. Review and apply only after staging tests.
create table if not exists public.wallet_pin_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.wallet_pin_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('purchase','transfer')),
  expires_at timestamptz not null default now() + interval '2 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.wallet_pin_credentials enable row level security;
alter table public.wallet_pin_authorizations enable row level security;
revoke all on public.wallet_pin_credentials, public.wallet_pin_authorizations from anon, authenticated, public;

create or replace function public.wallet_pin_set(p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $function$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 if p_pin is null or p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'status','invalid_pin'); end if;
 if exists(select 1 from public.wallet_pin_credentials where user_id=v_uid) then
   return jsonb_build_object('ok',false,'status','pin_already_set');
 end if;
 insert into public.wallet_pin_credentials(user_id,pin_hash) values(v_uid,extensions.crypt(p_pin,extensions.gen_salt('bf',12)));
 return jsonb_build_object('ok',true,'status','pin_set');
end
$function$;

create or replace function public.wallet_pin_status()
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare v_uid uuid:=auth.uid(); v_exists boolean;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 select exists(select 1 from public.wallet_pin_credentials where user_id=v_uid) into v_exists;
 return jsonb_build_object('ok',true,'configured',v_exists);
end
$function$;

create or replace function public.wallet_pin_verify(p_pin text,p_action text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $function$
declare v_uid uuid:=auth.uid(); v_row public.wallet_pin_credentials%rowtype; v_auth uuid;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 if p_action not in ('purchase','transfer') then return jsonb_build_object('ok',false,'status','invalid_action'); end if;
 select * into v_row from public.wallet_pin_credentials where user_id=v_uid for update;
 if not found then return jsonb_build_object('ok',false,'status','pin_not_set'); end if;
 if v_row.locked_until is not null and v_row.locked_until>now() then
   return jsonb_build_object('ok',false,'status','locked','until',v_row.locked_until);
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{4}$' or extensions.crypt(p_pin,v_row.pin_hash)<>v_row.pin_hash then
   update public.wallet_pin_credentials
   set failed_attempts=least(failed_attempts+1,5),
       locked_until=case when failed_attempts>=4 then now()+interval '15 minutes' else locked_until end,
       updated_at=now()
   where user_id=v_uid;
   return jsonb_build_object('ok',false,'status',case when v_row.failed_attempts>=4 then 'locked' else 'invalid_pin' end);
 end if;
 update public.wallet_pin_credentials set failed_attempts=0,locked_until=null,updated_at=now() where user_id=v_uid;
 delete from public.wallet_pin_authorizations where user_id=v_uid and (expires_at<now() or used_at is not null);
 insert into public.wallet_pin_authorizations(user_id,action) values(v_uid,p_action) returning id into v_auth;
 return jsonb_build_object('ok',true,'status','verified','authorization',v_auth);
end
$function$;

create or replace function public.wallet_pin_change(p_old_pin text,p_new_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $function$
declare v_uid uuid:=auth.uid(); v_row public.wallet_pin_credentials%rowtype;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'status','invalid_pin'); end if;
 select * into v_row from public.wallet_pin_credentials where user_id=v_uid for update;
 if not found then return jsonb_build_object('ok',false,'status','pin_not_set'); end if;
 if v_row.locked_until is not null and v_row.locked_until>now() then return jsonb_build_object('ok',false,'status','locked'); end if;
 if p_old_pin is null or p_old_pin !~ '^[0-9]{4}$' or extensions.crypt(p_old_pin,v_row.pin_hash)<>v_row.pin_hash then
   update public.wallet_pin_credentials
   set failed_attempts=least(failed_attempts+1,5),
       locked_until=case when failed_attempts>=4 then now()+interval '15 minutes' else locked_until end,
       updated_at=now() where user_id=v_uid;
   return jsonb_build_object('ok',false,'status','invalid_pin');
 end if;
 update public.wallet_pin_credentials set pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',12)),
   failed_attempts=0,locked_until=null,updated_at=now() where user_id=v_uid;
 delete from public.wallet_pin_authorizations where user_id=v_uid;
 return jsonb_build_object('ok',true,'status','pin_changed');
end
$function$;

-- Email recovery requires a fresh Supabase email-OTP-authenticated session.
create or replace function public.wallet_pin_recover(p_new_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth
as $function$
declare v_uid uuid:=auth.uid(); v_amr jsonb; v_recent_otp boolean;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'status','invalid_pin'); end if;
 v_amr:=coalesce(auth.jwt()->'amr','[]'::jsonb);
 select exists(
   select 1 from jsonb_array_elements(v_amr) as amr_entry(value)
   where value->>'method'='otp'
     and (value->>'timestamp') ~ '^[0-9]+([.][0-9]+)? > extract(epoch from now()-interval '5 minutes')
 ) into v_recent_otp;
 if not v_recent_otp then return jsonb_build_object('ok',false,'status','email_otp_required'); end if;
 update public.wallet_pin_credentials set pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',12)),
   failed_attempts=0,locked_until=null,updated_at=now() where user_id=v_uid;
 if not found then
   insert into public.wallet_pin_credentials(user_id,pin_hash) values(v_uid,extensions.crypt(p_new_pin,extensions.gen_salt('bf',12)));
 end if;
 delete from public.wallet_pin_authorizations where user_id=v_uid;
 return jsonb_build_object('ok',true,'status','pin_recovered');
end
$function$;

-- PIN-gated wrapper overloads atomically consume their one-use authorization.
create or replace function public.wallet_purchase_idem(
 p_request_id uuid,p_service text,p_amount_usd numeric,p_merutag text,p_phone text,p_pin_authorization uuid
) returns jsonb language plpgsql security definer set search_path = public
as $function$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_result jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 update public.wallet_pin_authorizations set used_at=now()
 where id=p_pin_authorization and user_id=v_uid and action='purchase' and used_at is null and expires_at>now();
 get diagnostics v_count = row_count;
 if v_count<>1 then return jsonb_build_object('ok',false,'status','pin_required'); end if;
 select public.wallet_purchase_idem(p_request_id,p_service,p_amount_usd,p_merutag,p_phone) into v_result;
 return v_result;
end
$function$;

create or replace function public.wallet_transfer(p_to_id text,p_amount numeric,p_request_id uuid,p_pin_authorization uuid)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_result jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 update public.wallet_pin_authorizations set used_at=now()
 where id=p_pin_authorization and user_id=v_uid and action='transfer' and used_at is null and expires_at>now();
 get diagnostics v_count = row_count;
 if v_count<>1 then return jsonb_build_object('ok',false,'status','pin_required'); end if;
 select public.wallet_transfer(p_to_id,p_amount,p_request_id) into v_result;
 return v_result;
end
$function$;

-- Revoke direct legacy paths and keep every new RPC private to authenticated callers.
revoke execute on function public.wallet_purchase(text,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.wallet_purchase_idem(uuid,text,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.wallet_transfer(text,numeric,uuid) from public, anon, authenticated;
revoke execute on function public.wallet_pin_set(text), public.wallet_pin_status(), public.wallet_pin_verify(text,text),
 public.wallet_pin_change(text,text), public.wallet_pin_recover(text),
 public.wallet_purchase_idem(uuid,text,numeric,text,text,uuid), public.wallet_transfer(text,numeric,uuid,uuid)
 from public, anon;
grant execute on function public.wallet_pin_set(text), public.wallet_pin_status(), public.wallet_pin_verify(text,text),
 public.wallet_pin_change(text,text), public.wallet_pin_recover(text),
 public.wallet_purchase_idem(uuid,text,numeric,text,text,uuid), public.wallet_transfer(text,numeric,uuid,uuid)
 to authenticated;

     and (value->>'timestamp')::numeric > extract(epoch from now()-interval '5 minutes')
 ) into v_recent_otp;
 if not v_recent_otp then return jsonb_build_object('ok',false,'status','email_otp_required'); end if;
 update public.wallet_pin_credentials set pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',12)),
   failed_attempts=0,locked_until=null,updated_at=now() where user_id=v_uid;
 if not found then
   insert into public.wallet_pin_credentials(user_id,pin_hash) values(v_uid,extensions.crypt(p_new_pin,extensions.gen_salt('bf',12)));
 end if;
 delete from public.wallet_pin_authorizations where user_id=v_uid;
 return jsonb_build_object('ok',true,'status','pin_recovered');
end
$function$;

-- PIN-gated wrapper overloads atomically consume their one-use authorization.
create or replace function public.wallet_purchase_idem(
 p_request_id uuid,p_service text,p_amount_usd numeric,p_merutag text,p_phone text,p_pin_authorization uuid
) returns jsonb language plpgsql security definer set search_path = public
as $function$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_result jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 update public.wallet_pin_authorizations set used_at=now()
 where id=p_pin_authorization and user_id=v_uid and action='purchase' and used_at is null and expires_at>now();
 get diagnostics v_count = row_count;
 if v_count<>1 then return jsonb_build_object('ok',false,'status','pin_required'); end if;
 select public.wallet_purchase_idem(p_request_id,p_service,p_amount_usd,p_merutag,p_phone) into v_result;
 return v_result;
end
$function$;

create or replace function public.wallet_transfer(p_to_id text,p_amount numeric,p_request_id uuid,p_pin_authorization uuid)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_result jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'status','unauthenticated'); end if;
 update public.wallet_pin_authorizations set used_at=now()
 where id=p_pin_authorization and user_id=v_uid and action='transfer' and used_at is null and expires_at>now();
 get diagnostics v_count = row_count;
 if v_count<>1 then return jsonb_build_object('ok',false,'status','pin_required'); end if;
 select public.wallet_transfer(p_to_id,p_amount,p_request_id) into v_result;
 return v_result;
end
$function$;

-- Revoke direct legacy paths and keep every new RPC private to authenticated callers.
revoke execute on function public.wallet_purchase(text,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.wallet_purchase_idem(uuid,text,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.wallet_transfer(text,numeric,uuid) from public, anon, authenticated;
revoke execute on function public.wallet_pin_set(text), public.wallet_pin_status(), public.wallet_pin_verify(text,text),
 public.wallet_pin_change(text,text), public.wallet_pin_recover(text),
 public.wallet_purchase_idem(uuid,text,numeric,text,text,uuid), public.wallet_transfer(text,numeric,uuid,uuid)
 from public, anon;
grant execute on function public.wallet_pin_set(text), public.wallet_pin_status(), public.wallet_pin_verify(text,text),
 public.wallet_pin_change(text,text), public.wallet_pin_recover(text),
 public.wallet_purchase_idem(uuid,text,numeric,text,text,uuid), public.wallet_transfer(text,numeric,uuid,uuid)
 to authenticated;
