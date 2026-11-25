-- Migration: immutable evaluations, criteria scores and ethical flags (T013) — data-model.md →
-- "Evaluación", FR-044, SC-004. Written only by save_practice_evaluation (T141).
--
-- Rollback:
--   drop table if exists public.practice_ethical_flags, public.practice_evaluation_criteria,
--     public.practice_evaluations;
--   drop function if exists private.match_evaluation_owner(), private.criterion_max_is_weight();

create table public.practice_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  session_id uuid not null references public.practice_sessions (id) on delete restrict
    constraint practice_evaluations_session_key unique,
  rubric_id uuid not null references public.rubrics (id) on delete restrict,
  rubric_version text not null constraint practice_evaluations_rubric_version_length check (char_length(rubric_version) between 1 and 20),
  prompt_version text not null constraint practice_evaluations_prompt_version_length check (char_length(prompt_version) between 1 and 60),
  model text not null constraint practice_evaluations_model_length check (char_length(model) between 1 and 100),
  total_score smallint constraint practice_evaluations_total_range check (total_score between 0 and 100),
  level public.score_level,
  strengths text[] not null constraint practice_evaluations_strengths_valid check (private.valid_text_array(strengths, 0, 5, 200)),
  improvements text[] not null constraint practice_evaluations_improvements_valid check (private.valid_text_array(improvements, 0, 5, 200)),
  suggested_drill_text text not null
    constraint practice_evaluations_drill_length check (char_length(suggested_drill_text) between 1 and 300 and btrim(suggested_drill_text) <> ''),
  suggested_drill_stage public.cautiva_stage not null,
  auto_attempts smallint not null constraint practice_evaluations_auto_attempts_range check (auto_attempts between 1 and 3),
  manual_retries smallint not null constraint practice_evaluations_manual_retries_range check (manual_retries between 0 and 3),
  created_at timestamptz not null default now(),
  constraint practice_evaluations_level_with_total check ((level is null) = (total_score is null)),
  constraint practice_evaluations_level_matches_total check (
    total_score is null
    or level = case
      when total_score >= 90 then 'advanced'::public.score_level
      when total_score >= 75 then 'competent'::public.score_level
      when total_score >= 60 then 'developing'::public.score_level
      else 'reinforcement'::public.score_level
    end
  )
);
create index practice_evaluations_org_user_idx on public.practice_evaluations (organization_id, user_id, created_at desc);

create or replace function private.match_evaluation_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  select e.organization_id, e.user_id into v_org, v_user
    from public.practice_evaluations e where e.id = new.evaluation_id;
  if v_org is null or v_org <> new.organization_id or v_user <> new.user_id then
    raise exception 'organization_id/user_id must match the evaluation' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.match_evaluation_owner() from public;

create trigger practice_evaluations_match_owner before insert on public.practice_evaluations
  for each row execute function private.match_session_owner();
create trigger practice_evaluations_immutable before update or delete on public.practice_evaluations
  for each row execute function private.reject_immutable_change();

-- practice_evaluation_criteria ------------------------------------------------------------------------------
create table public.practice_evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  evaluation_id uuid not null references public.practice_evaluations (id) on delete restrict,
  criterion_id uuid not null references public.rubric_criteria (id) on delete restrict,
  status public.criterion_status not null,
  score smallint,
  max_score smallint not null constraint practice_evaluation_criteria_max_positive check (max_score between 1 and 100),
  evidence_seqs integer[] not null,
  justification text not null
    constraint practice_evaluation_criteria_justification_length check (char_length(justification) between 1 and 600 and btrim(justification) <> ''),
  improvement text not null
    constraint practice_evaluation_criteria_improvement_length check (char_length(improvement) <= 400),
  confidence numeric(3, 2) not null constraint practice_evaluation_criteria_confidence_range check (confidence between 0 and 1),
  constraint practice_evaluation_criteria_evaluation_criterion_key unique (evaluation_id, criterion_id),
  constraint practice_evaluation_criteria_score_by_status check (
    (status = 'no_evaluable' and score is null)
    or (status = 'evaluated' and score is not null and score between 0 and max_score
        and cardinality(evidence_seqs) >= 1)
  ),
  constraint practice_evaluation_criteria_evidence_positive
    check (coalesce(array_ndims(evidence_seqs), 1) = 1 and 0 < all (evidence_seqs))
);
create index practice_evaluation_criteria_org_eval_idx
  on public.practice_evaluation_criteria (organization_id, evaluation_id);

-- max_score always equals the rubric weight (FR-040).
create or replace function private.criterion_max_is_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weight smallint;
begin
  select c.weight into v_weight from public.rubric_criteria c where c.id = new.criterion_id;
  if v_weight is null or v_weight <> new.max_score then
    raise exception 'max_score must equal the rubric criterion weight' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.criterion_max_is_weight() from public;

create trigger practice_evaluation_criteria_match_owner before insert on public.practice_evaluation_criteria
  for each row execute function private.match_evaluation_owner();
create trigger practice_evaluation_criteria_max_weight before insert on public.practice_evaluation_criteria
  for each row execute function private.criterion_max_is_weight();
create trigger practice_evaluation_criteria_immutable before update or delete on public.practice_evaluation_criteria
  for each row execute function private.reject_immutable_change();

-- practice_ethical_flags -------------------------------------------------------------------------------------
create table public.practice_ethical_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  evaluation_id uuid not null references public.practice_evaluations (id) on delete restrict,
  type public.ethical_flag_type not null,
  explanation text not null
    constraint practice_ethical_flags_explanation_length check (char_length(explanation) between 1 and 400 and btrim(explanation) <> ''),
  message_seqs integer[] not null
    constraint practice_ethical_flags_seqs_valid
    check (coalesce(array_ndims(message_seqs), 1) = 1 and cardinality(message_seqs) >= 1 and 0 < all (message_seqs))
);
create index practice_ethical_flags_org_eval_idx on public.practice_ethical_flags (organization_id, evaluation_id);
create trigger practice_ethical_flags_match_owner before insert on public.practice_ethical_flags
  for each row execute function private.match_evaluation_owner();
create trigger practice_ethical_flags_immutable before update or delete on public.practice_ethical_flags
  for each row execute function private.reject_immutable_change();
