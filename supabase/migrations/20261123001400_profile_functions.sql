-- Migration: profile editing (T176) — contracts/database-rpc.md `update_my_profile`, data-model.md
-- `profiles.full_name` / `profiles.timezone`. The user cannot UPDATE these columns directly (column GRANT
-- only covers onboarding_*); this function validates them and keeps the personal organization in sync.
--
-- Rollback:
--   drop function if exists public.update_my_profile(text, text);

create or replace function public.update_my_profile(p_full_name text, p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_tz text := btrim(coalesce(p_timezone, ''));
  v_personal uuid;
begin
  if v_uid is null or not private.current_session_ok()
     or not (private.is_operative_user() or private.is_superadmin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid full_name' using errcode = '23514', detail = 'full_name';
  end if;
  if not private.is_valid_timezone(v_tz) then
    raise exception 'invalid timezone' using errcode = '22023', detail = 'timezone';
  end if;

  update public.profiles
     set full_name = v_name, timezone = v_tz
   where user_id = v_uid;

  -- Personal organization where the user is the only member: name and time zone follow the profile
  -- (the slug never changes).
  select o.id into v_personal
    from public.organizations o
    join public.memberships m on m.organization_id = o.id and m.user_id = v_uid
   where o.type = 'personal'
     and not exists (
       select 1 from public.memberships other
        where other.organization_id = o.id and other.user_id <> v_uid
     )
   limit 1;

  if v_personal is not null then
    update public.organizations
       set name = v_name, timezone = v_tz
     where id = v_personal;
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
