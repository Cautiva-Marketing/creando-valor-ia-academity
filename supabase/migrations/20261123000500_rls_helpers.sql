-- Migration: RLS helper functions (T016) — data-model.md → "Funciones helper de RLS", research.md §R7
-- Session policy: sellers 30 days max life + 7 days max inactivity; superadmin 12 hours max life.
--
-- Rollback:
--   drop function if exists private.is_operative_user(), private.has_org_role(uuid, public.org_role),
--     private.active_org_ids(), private.is_superadmin(), private.current_session_ok();

create or replace function private.current_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when exists (select 1 from public.platform_admins pa where pa.user_id = s.user_id)
        then now() - s.created_at < interval '12 hours'
      else now() - s.created_at < interval '30 days'
       and now() - coalesce(s.refreshed_at at time zone 'UTC', s.created_at) < interval '7 days'
    end
    from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
  ), false);
$$;

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
     and private.current_session_ok();
$$;

create or replace function private.active_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and o.status = 'active'
     and private.current_session_ok();
$$;

create or replace function private.has_org_role(p_org uuid, p_role public.org_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.organizations o on o.id = m.organization_id
     where m.organization_id = p_org
       and m.user_id = auth.uid()
       and m.status = 'active'
       and o.status = 'active'
       and p_role = any (m.roles)
  ) and private.current_session_ok();
$$;

create or replace function private.is_operative_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    private.current_session_ok()
    and exists (
      select 1
        from public.memberships m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = auth.uid() and m.status = 'active' and o.status = 'active'
    )
  ) or private.is_superadmin();
$$;

-- Policies execute these helpers with the privileges of the querying role. The `private` schema
-- itself is not usable by the API roles, so they cannot be called by name through PostgREST.
revoke all on function private.current_session_ok() from public;
revoke all on function private.is_superadmin() from public;
revoke all on function private.active_org_ids() from public;
revoke all on function private.has_org_role(uuid, public.org_role) from public;
revoke all on function private.is_operative_user() from public;
grant execute on function private.current_session_ok() to authenticated, service_role;
grant execute on function private.is_superadmin() to authenticated, service_role;
grant execute on function private.active_org_ids() to authenticated, service_role;
grant execute on function private.has_org_role(uuid, public.org_role) to authenticated, service_role;
grant execute on function private.is_operative_user() to authenticated, service_role;
