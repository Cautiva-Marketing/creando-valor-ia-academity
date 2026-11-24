-- Migration: RLS on every table + explicit grants (T017) — data-model.md → "Políticas RLS (resumen)"
-- Helpers are wrapped in `(select …)` so they are evaluated once per statement.
--
-- Rollback:
--   drop policy ... (each policy below);
--   alter table ... disable row level security;   -- never in production: violates Principle I
--   grant all on all tables in schema public to anon, authenticated;

-- RLS everywhere ---------------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.memberships enable row level security;
alter table public.teams enable row level security;
alter table public.quotas enable row level security;
alter table public.ai_usage enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.invitations enable row level security;
alter table public.access_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table private.rate_limit_events enable row level security;

-- No implicit privileges for the API roles ---------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated, public;

grant select on public.organizations, public.profiles, public.platform_admins, public.memberships,
  public.teams, public.quotas, public.ai_usage, public.legal_documents, public.legal_acceptances,
  public.invitations, public.access_requests, public.audit_logs
  to authenticated;
-- The user can only change their onboarding progress directly (full_name/timezone go through
-- update_my_profile, email is synced by the server).
grant update (onboarding_status, onboarding_step) on public.profiles to authenticated;
-- Public legal documents for the landing and legal pages.
grant select on public.legal_documents to anon;

-- organizations --------------------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select private.active_org_ids()) or (select private.is_superadmin()));

-- profiles ---------------------------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.current_session_ok()));

create policy profiles_update_own_onboarding on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_operative_user()))
  with check (user_id = (select auth.uid()) and (select private.is_operative_user()));

-- platform_admins (own row, so the UI knows whether the account is a superadmin) -------------------------
create policy platform_admins_select_own on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- memberships ----------------------------------------------------------------------------------------
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()))
    or (select private.is_superadmin())
  );

-- teams ----------------------------------------------------------------------------------------------
create policy teams_select on public.teams
  for select to authenticated
  using (organization_id in (select private.active_org_ids()));

-- quotas ---------------------------------------------------------------------------------------------
create policy quotas_select on public.quotas
  for select to authenticated
  using (organization_id in (select private.active_org_ids()) or (select private.is_superadmin()));

-- ai_usage -------------------------------------------------------------------------------------------
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (organization_id in (select private.active_org_ids()) or (select private.is_superadmin()));

-- invitations / access_requests / audit_logs: superadmin with aal2 only -----------------------------
create policy invitations_select on public.invitations
  for select to authenticated
  using ((select private.is_superadmin()));

create policy access_requests_select on public.access_requests
  for select to authenticated
  using ((select private.is_superadmin()));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select private.is_superadmin()));

-- legal documents: everyone can read ---------------------------------------------------------------------
create policy legal_documents_select on public.legal_documents
  for select to anon, authenticated
  using (true);

-- legal_acceptances: own rows ------------------------------------------------------------------------
create policy legal_acceptances_select_own on public.legal_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.current_session_ok()));

-- private.rate_limit_events: no policies (service_role through public wrappers only).
