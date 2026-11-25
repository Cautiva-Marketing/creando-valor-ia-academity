-- Migration: RLS and grants of every 002 table (T015) — data-model.md → "Clasificación de tablas nuevas",
-- FR-054, FR-056. No INSERT/UPDATE/DELETE for authenticated (everything goes through functions), nothing
-- for anon and no superadmin policy over content. Helpers are wrapped in `(select …)`.
--
-- Rollback:
--   drop policy ... (each policy below);
--   revoke select on (each table below) from authenticated;   -- RLS stays enabled (Principle I)

alter table public.products enable row level security;
alter table public.product_versions enable row level security;
alter table public.objections enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_buyer_profiles enable row level security;
alter table public.practice_session_secrets enable row level security;
alter table public.practice_session_reveals enable row level security;
alter table public.practice_messages enable row level security;
alter table public.practice_evaluations enable row level security;
alter table public.practice_evaluation_criteria enable row level security;
alter table public.practice_ethical_flags enable row level security;
alter table public.simulation_consumptions enable row level security;
alter table public.practice_setup_attempts enable row level security;

revoke all on public.products, public.product_versions, public.objections, public.rubrics,
  public.rubric_criteria, public.practice_sessions, public.practice_buyer_profiles,
  public.practice_session_secrets, public.practice_session_reveals, public.practice_messages,
  public.practice_evaluations, public.practice_evaluation_criteria, public.practice_ethical_flags,
  public.simulation_consumptions, public.practice_setup_attempts
  from anon, authenticated, public;
revoke all on sequence public.practice_setup_attempts_id_seq from anon, authenticated, public;

grant select on public.products, public.product_versions, public.objections, public.rubrics,
  public.rubric_criteria, public.practice_sessions, public.practice_buyer_profiles,
  public.practice_session_secrets, public.practice_session_reveals, public.practice_messages,
  public.practice_evaluations, public.practice_evaluation_criteria, public.practice_ethical_flags,
  public.simulation_consumptions
  to authenticated;
-- practice_setup_attempts: no grant and no policy (read only by functions).

-- Products: members of the active organization ---------------------------------------------------------
create policy products_select on public.products
  for select to authenticated
  using (organization_id in (select private.active_org_ids()));

create policy product_versions_select on public.product_versions
  for select to authenticated
  using (organization_id in (select private.active_org_ids()));

create policy objections_select on public.objections
  for select to authenticated
  using (organization_id in (select private.active_org_ids()));

-- Rubric: platform reference -----------------------------------------------------------------------------
create policy rubrics_select on public.rubrics
  for select to authenticated
  using (true);

create policy rubric_criteria_select on public.rubric_criteria
  for select to authenticated
  using (true);

-- Practice content: only the owner, in an active organization, with a valid session -------------------
create policy practice_sessions_select_own on public.practice_sessions
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

create policy practice_buyer_profiles_select_own on public.practice_buyer_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

-- Hidden persona: readable only once the session ended (research.md §R10, FR-014).
create policy practice_session_secrets_select_own_ended on public.practice_session_secrets
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select private.active_org_ids())
    and exists (
      select 1 from public.practice_sessions s
       where s.id = practice_session_secrets.session_id
         and s.status in ('finalized', 'evaluated')
    )
  );

create policy practice_session_reveals_select_own on public.practice_session_reveals
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

create policy practice_messages_select_own on public.practice_messages
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

create policy practice_evaluations_select_own on public.practice_evaluations
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

create policy practice_evaluation_criteria_select_own on public.practice_evaluation_criteria
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

create policy practice_ethical_flags_select_own on public.practice_ethical_flags
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));

create policy simulation_consumptions_select_own on public.simulation_consumptions
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select private.active_org_ids()));
