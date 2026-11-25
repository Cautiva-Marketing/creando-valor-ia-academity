-- Migration: practice evaluation functions (T141) — contracts/database-rpc.md; data-model.md →
-- "Cálculos", practice_evaluations, practice_evaluation_criteria, practice_ethical_flags; research.md
-- §R8, §R9; FR-036–FR-045, AC-04, SC-002, SC-003.
--
-- claim_practice_evaluation → set_practice_evaluation_phase → save_practice_evaluation (second layer
-- of validation; the total and the level are recalculated here, never taken from the model) or
-- fail_practice_evaluation_attempt. retry_practice_evaluation is the seller's manual retry (FR-043).
--
-- Rollback:
--   drop function if exists public.retry_practice_evaluation(uuid),
--     public.fail_practice_evaluation_attempt(uuid, text), public.save_practice_evaluation(uuid, jsonb),
--     public.set_practice_evaluation_phase(uuid, public.evaluation_phase),
--     public.claim_practice_evaluation(uuid), private.compute_evaluation_total(jsonb),
--     private.score_level_for(int);

-- FR-041: Σ score / Σ max of the evaluated criteria as 0–100, round-half-up in integer arithmetic
-- (identical to computeTotal in src/features/practice/domain/scoring.ts). NULL when nothing is
-- evaluable. Input: `{ "criteria": [{ "status", "score", "max_score" }] }`.
create or replace function private.compute_evaluation_total(p_evaluation jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when count(*) = 0 or coalesce(sum(m), 0) = 0 then null
              else div(200 * sum(s) + sum(m), 2 * sum(m))::int end
    from (
      select (c ->> 'score')::bigint as s, (c ->> 'max_score')::bigint as m
        from jsonb_array_elements(coalesce(p_evaluation -> 'criteria', '[]'::jsonb)) as c
       where c ->> 'status' = 'evaluated' and c ->> 'score' is not null
    ) x;
$$;

-- FR-042: ≥ 90 advanced · ≥ 75 competent · ≥ 60 developing · otherwise reinforcement.
create or replace function private.score_level_for(p_total int)
returns public.score_level
language sql
immutable
set search_path = ''
as $$
  select case
    when p_total is null then null
    when p_total >= 90 then 'advanced'::public.score_level
    when p_total >= 75 then 'competent'::public.score_level
    when p_total >= 60 then 'developing'::public.score_level
    else 'reinforcement'::public.score_level
  end;
$$;

-- claim: pending → in_progress (reading), only in active organizations and before the deadline.
-- Duplicate dispatches are harmless: a locked or already taken evaluation returns NULL.
create or replace function public.claim_practice_evaluation(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.practice_sessions;
  v_rubric public.rubrics;
  v_result jsonb;
begin
  select s.* into v_session
    from public.practice_sessions s
    join public.organizations o on o.id = s.organization_id
   where s.id = p_session
     and s.status = 'finalized'
     and s.evaluation_status = 'pending'
     and s.evaluation_due_at > now()
     and o.status = 'active'
   for update of s skip locked;
  if v_session.id is null then
    return null;
  end if;

  select * into v_rubric from public.rubrics r where r.slug = 'ventas-consultivas' and r.is_current;
  if v_rubric.id is null then
    select * into v_rubric from public.rubrics r where r.is_current order by r.published_at desc limit 1;
  end if;

  update public.practice_sessions s
     set evaluation_status = 'in_progress', evaluation_phase = 'reading', evaluation_failure_code = null
   where s.id = v_session.id;

  -- FR-038: transcript, scenario and rubric only — no user name, email or other sessions.
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'organizationId', s.organization_id, 'userId', s.user_id, 'difficulty', s.difficulty,
      'focusStage', s.focus_stage, 'endReason', s.end_reason,
      'attempt', s.evaluation_auto_attempts + 1, 'dueAt', s.evaluation_due_at),
    'scenario', jsonb_build_object(
      'buyer', jsonb_build_object(
        'name', p.name, 'age', p.age, 'occupation', p.occupation, 'intro', p.intro, 'goal', p.goal,
        'motivation', sec.motivation, 'personality', sec.personality),
      'revealables', sec.revealables,
      'visibleObjection', s.visible_objection,
      'hiddenObjections', sec.hidden_objections,
      'product', jsonb_build_object(
        'version', s.product_version, 'sector', v.sector, 'name', v.name, 'description', v.description,
        'priceKind', v.price_kind, 'priceMin', v.price_min, 'priceMax', v.price_max,
        'benefits', to_jsonb(v.benefits), 'differentiators', to_jsonb(v.differentiators),
        'verifiableFacts', to_jsonb(v.verifiable_facts))),
    'rubric', jsonb_build_object(
      'id', v_rubric.id, 'version', v_rubric.version, 'name', v_rubric.name,
      'criteria', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'key', c.key, 'name', c.name, 'weight', c.weight, 'stages', to_jsonb(c.stages),
                 'description', c.description, 'anchors', c.anchors) order by c.position)
          from public.rubric_criteria c where c.rubric_id = v_rubric.id), '[]'::jsonb)),
    'transcript', coalesce((
      select jsonb_agg(jsonb_build_object('seq', m.seq, 'author', m.author, 'content', m.content) order by m.seq)
        from public.practice_messages m where m.session_id = s.id), '[]'::jsonb)
  ) into v_result
  from public.practice_sessions s
  join public.practice_buyer_profiles p on p.session_id = s.id
  join public.practice_session_secrets sec on sec.session_id = s.id
  join public.product_versions v on v.id = s.product_version_id
  where s.id = v_session.id;
  return v_result;
end;
$$;

create or replace function public.set_practice_evaluation_phase(p_session uuid, p_phase public.evaluation_phase)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.practice_sessions s
     set evaluation_phase = p_phase
   where s.id = p_session and s.evaluation_status = 'in_progress';
$$;

-- Second validation layer (research.md §R9). Payload (evidence already converted from mN to seq):
-- { rubric_id, prompt_version, model, total_score (ignored),
--   criteria: [{ key, status, score, max_score, evidence_seqs, justification, improvement, confidence }],
--   strengths, improvements, suggested_drill_text, suggested_drill_stage,
--   ethical_flags: [{ type, explanation, message_seqs }] }
create or replace function public.save_practice_evaluation(p_session uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.practice_sessions;
  v_rubric uuid := (p_payload ->> 'rubric_id')::uuid;
  v_rubric_version text;
  v_criteria jsonb := coalesce(p_payload -> 'criteria', '[]'::jsonb);
  v_flags jsonb := coalesce(p_payload -> 'ethical_flags', '[]'::jsonb);
  v_seller_seqs int[];
  v_criterion jsonb;
  v_flag jsonb;
  v_weight smallint;
  v_criterion_id uuid;
  v_seqs int[];
  v_total int;
  v_evaluation uuid;
begin
  select * into v_session from public.practice_sessions s where s.id = p_session for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'finalized' or v_session.evaluation_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0010', detail = 'not_in_progress';
  end if;

  select r.version into v_rubric_version from public.rubrics r where r.id = v_rubric;
  if v_rubric_version is null then
    raise exception 'unknown rubric' using errcode = '23514', detail = 'rubric';
  end if;

  if jsonb_typeof(v_criteria) <> 'array' or jsonb_typeof(v_flags) <> 'array' then
    raise exception 'criteria and ethical_flags must be arrays' using errcode = '23514', detail = 'criteria';
  end if;
  -- Every rubric criterion exactly once.
  if jsonb_array_length(v_criteria) <> (select count(*) from public.rubric_criteria c where c.rubric_id = v_rubric)
     or (select count(distinct c ->> 'key') from jsonb_array_elements(v_criteria) c) <> jsonb_array_length(v_criteria)
     or exists (
       select 1 from jsonb_array_elements(v_criteria) c
        where not exists (select 1 from public.rubric_criteria rc
                           where rc.rubric_id = v_rubric and rc.key = c ->> 'key'))
  then
    raise exception 'criteria must match the rubric once each' using errcode = '23514', detail = 'criteria';
  end if;

  select coalesce(array_agg(m.seq), '{}') into v_seller_seqs
    from public.practice_messages m where m.session_id = p_session and m.author = 'seller';

  for v_criterion in select * from jsonb_array_elements(v_criteria) loop
    select rc.weight into v_weight from public.rubric_criteria rc
     where rc.rubric_id = v_rubric and rc.key = v_criterion ->> 'key';
    if (v_criterion ->> 'max_score')::int is distinct from v_weight then
      raise exception 'max_score must equal the weight' using errcode = '23514', detail = 'max_score';
    end if;
    if jsonb_typeof(v_criterion -> 'evidence_seqs') <> 'array' then
      raise exception 'evidence_seqs must be an array' using errcode = '23514', detail = 'evidence';
    end if;
    select coalesce(array_agg(e::int), '{}') into v_seqs
      from jsonb_array_elements_text(v_criterion -> 'evidence_seqs') e;
    if v_criterion ->> 'status' = 'evaluated' then
      if jsonb_typeof(v_criterion -> 'score') <> 'number'
         or (v_criterion ->> 'score')::numeric <> trunc((v_criterion ->> 'score')::numeric)
         or (v_criterion ->> 'score')::int not between 0 and v_weight then
        raise exception 'score out of range' using errcode = '23514', detail = 'score';
      end if;
      if cardinality(v_seqs) = 0 then
        raise exception 'evaluated criterion without evidence' using errcode = '23514', detail = 'evidence';
      end if;
    elsif v_criterion ->> 'status' = 'no_evaluable' then
      if v_criterion -> 'score' is not null and jsonb_typeof(v_criterion -> 'score') <> 'null' then
        raise exception 'no_evaluable criterion with score' using errcode = '23514', detail = 'score';
      end if;
    else
      raise exception 'unknown status' using errcode = '23514', detail = 'status';
    end if;
    if not (v_seqs <@ v_seller_seqs) then
      raise exception 'evidence must cite seller messages' using errcode = '23514', detail = 'evidence';
    end if;
  end loop;

  for v_flag in select * from jsonb_array_elements(v_flags) loop
    if jsonb_typeof(v_flag -> 'message_seqs') <> 'array' then
      raise exception 'message_seqs must be an array' using errcode = '23514', detail = 'flags';
    end if;
    select coalesce(array_agg(e::int), '{}') into v_seqs
      from jsonb_array_elements_text(v_flag -> 'message_seqs') e;
    if cardinality(v_seqs) = 0 or not (v_seqs <@ v_seller_seqs) then
      raise exception 'flags must cite seller messages' using errcode = '23514', detail = 'flags';
    end if;
  end loop;

  -- FR-041/FR-042: the proposed total is ignored.
  v_total := private.compute_evaluation_total(jsonb_build_object('criteria', v_criteria));

  insert into public.practice_evaluations (organization_id, user_id, session_id, rubric_id, rubric_version,
    prompt_version, model, total_score, level, strengths, improvements, suggested_drill_text,
    suggested_drill_stage, auto_attempts, manual_retries)
  values (v_session.organization_id, v_session.user_id, p_session, v_rubric, v_rubric_version,
    p_payload ->> 'prompt_version', p_payload ->> 'model', v_total, private.score_level_for(v_total),
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'strengths', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_payload -> 'improvements', '[]'::jsonb))),
    p_payload ->> 'suggested_drill_text', (p_payload ->> 'suggested_drill_stage')::public.cautiva_stage,
    least(v_session.evaluation_auto_attempts + 1, 3), v_session.evaluation_manual_retries)
  returning id into v_evaluation;

  for v_criterion in select * from jsonb_array_elements(v_criteria) loop
    select rc.id into v_criterion_id from public.rubric_criteria rc
     where rc.rubric_id = v_rubric and rc.key = v_criterion ->> 'key';
    insert into public.practice_evaluation_criteria (organization_id, user_id, evaluation_id, criterion_id,
      status, score, max_score, evidence_seqs, justification, improvement, confidence)
    values (v_session.organization_id, v_session.user_id, v_evaluation, v_criterion_id,
      (v_criterion ->> 'status')::public.criterion_status, (v_criterion ->> 'score')::smallint,
      (v_criterion ->> 'max_score')::smallint,
      array(select e::int from jsonb_array_elements_text(v_criterion -> 'evidence_seqs') e),
      v_criterion ->> 'justification', coalesce(v_criterion ->> 'improvement', ''),
      (v_criterion ->> 'confidence')::numeric);
  end loop;

  for v_flag in select * from jsonb_array_elements(v_flags) loop
    insert into public.practice_ethical_flags (organization_id, user_id, evaluation_id, type, explanation, message_seqs)
    values (v_session.organization_id, v_session.user_id, v_evaluation,
      (v_flag ->> 'type')::public.ethical_flag_type, v_flag ->> 'explanation',
      array(select e::int from jsonb_array_elements_text(v_flag -> 'message_seqs') e));
  end loop;

  update public.practice_sessions s
     set status = 'evaluated', evaluation_status = null, evaluation_phase = null,
         evaluation_due_at = null, evaluation_failure_code = null
   where s.id = p_session;
  return v_evaluation;
end;
$$;

-- A failed automatic attempt: back to pending while attempts and time remain (> 50 s, the timeout of
-- one attempt); otherwise failed, or unavailable when the 3 manual retries are used (final).
create or replace function public.fail_practice_evaluation_attempt(p_session uuid, p_failure_code text)
returns table (evaluation_status public.evaluation_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session public.practice_sessions;
  v_status public.evaluation_status;
begin
  select * into v_session from public.practice_sessions s where s.id = p_session for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_session.evaluation_status is distinct from 'in_progress' then
    return query select v_session.evaluation_status;
    return;
  end if;

  v_status := case
    when v_session.evaluation_auto_attempts + 1 < 3 and v_session.evaluation_due_at > now() + interval '50 seconds'
      then 'pending'
    when v_session.evaluation_manual_retries >= 3 then 'unavailable'
    else 'failed'
  end::public.evaluation_status;

  update public.practice_sessions s
     set evaluation_status = v_status,
         evaluation_phase = null,
         evaluation_auto_attempts = least(s.evaluation_auto_attempts + 1, 3),
         evaluation_failure_code = p_failure_code,
         evaluation_due_at = case when v_status = 'pending' then s.evaluation_due_at end
   where s.id = p_session;
  return query select v_status;
end;
$$;

-- FR-043: manual retry by the seller (max 3 per session); does not consume quota.
create or replace function public.retry_practice_evaluation(p_session uuid)
returns table (manual_retries_left int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session public.practice_sessions;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_session from public.practice_sessions s
   where s.id = p_session and s.user_id = v_uid for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_session.organization_id);

  if v_session.evaluation_status is distinct from 'failed' then
    raise exception 'not_failed' using errcode = 'P0010', detail = 'not_failed';
  end if;
  if v_session.evaluation_manual_retries >= 3 then
    raise exception 'retries_exhausted' using errcode = 'P0010', detail = 'retries_exhausted';
  end if;

  update public.practice_sessions s
     set evaluation_status = 'pending',
         evaluation_manual_retries = s.evaluation_manual_retries + 1,
         evaluation_auto_attempts = 0,
         evaluation_failure_code = null,
         evaluation_due_at = now() + interval '3 minutes'
   where s.id = p_session;
  return query select 3 - (v_session.evaluation_manual_retries + 1);
end;
$$;

revoke all on function private.compute_evaluation_total(jsonb) from public;
revoke all on function private.score_level_for(int) from public;
revoke all on function public.claim_practice_evaluation(uuid) from public, anon, authenticated;
revoke all on function public.set_practice_evaluation_phase(uuid, public.evaluation_phase) from public, anon, authenticated;
revoke all on function public.save_practice_evaluation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_practice_evaluation_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.retry_practice_evaluation(uuid) from public, anon;

grant execute on function public.claim_practice_evaluation(uuid) to service_role;
grant execute on function public.set_practice_evaluation_phase(uuid, public.evaluation_phase) to service_role;
grant execute on function public.save_practice_evaluation(uuid, jsonb) to service_role;
grant execute on function public.fail_practice_evaluation_attempt(uuid, text) to service_role;
grant execute on function public.retry_practice_evaluation(uuid) to authenticated;
