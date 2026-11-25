-- Migration: simulation consumptions, setup attempts and ai_usage changes (T014) — data-model.md →
-- "Cuota y control de costo", research.md §R7.
--
-- Rollback:
--   alter table public.ai_usage drop constraint if exists ai_usage_simulation_id_fkey,
--     drop column if exists first_chunk_ms, drop column if exists attempt, drop column if exists outcome;
--   drop table if exists public.practice_setup_attempts, public.simulation_consumptions;

-- simulation_consumptions: one row per started session; quota usage is counted here (FR-018) ----------
create table public.simulation_consumptions (
  session_id uuid primary key references public.practice_sessions (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  consumed_at timestamptz not null default now()
);
create index simulation_consumptions_org_consumed_idx on public.simulation_consumptions (organization_id, consumed_at);
create trigger simulation_consumptions_match_owner before insert on public.simulation_consumptions
  for each row execute function private.match_session_owner();
create trigger simulation_consumptions_immutable before update or delete on public.simulation_consumptions
  for each row execute function private.reject_immutable_change();

-- practice_setup_attempts: cost control of persona generation (FR-016), no content --------------------
create table public.practice_setup_attempts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  outcome public.setup_outcome not null,
  failure_code text
    constraint practice_setup_attempts_failure_code_valid check (
      (outcome = 'success' and failure_code is null)
      or (outcome = 'failure' and failure_code in ('provider_unavailable', 'invalid_persona'))
    ),
  created_at timestamptz not null default now()
);
create index practice_setup_attempts_org_user_created_idx
  on public.practice_setup_attempts (organization_id, user_id, created_at);

-- ai_usage: one row per attempt with its outcome; buyer/evaluator rows reference the session ----------
alter table public.ai_usage
  add column outcome public.ai_call_outcome not null default 'success',
  add column attempt smallint not null default 1
    constraint ai_usage_attempt_range check (attempt between 1 and 10),
  add column first_chunk_ms integer
    constraint ai_usage_first_chunk_non_negative check (first_chunk_ms is null or first_chunk_ms >= 0);

alter table public.ai_usage
  add constraint ai_usage_simulation_id_fkey
  foreign key (simulation_id) references public.practice_sessions (id) on delete restrict;
create index ai_usage_simulation_idx on public.ai_usage (simulation_id) where simulation_id is not null;
