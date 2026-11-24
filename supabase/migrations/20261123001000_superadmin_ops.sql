-- Migration: superadmin operations (T081, FR-027a).
-- Rollback:
--   drop function if exists public.revoke_user_sessions(uuid);
--   drop function if exists private.revoke_user_sessions(uuid);

-- Deletes every Auth session of a user (refresh tokens cascade). The next request of any of those
-- sessions fails `private.current_session_ok()` and is signed out. Returns the number revoked.
create or replace function private.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'user id required' using errcode = '22023';
  end if;
  delete from auth.sessions s where s.user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.revoke_user_sessions(uuid) from public;

-- Public wrapper for the operations script (service_role only; `private` is not exposed).
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.revoke_user_sessions(p_user_id);
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
