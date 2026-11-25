-- T132 — practice evaluation (contracts/database-rpc.md; data-model.md → Cálculos; research.md §R8,
-- §R9; FR-036–FR-045, AC-04): claim_practice_evaluation, set_practice_evaluation_phase,
-- save_practice_evaluation (second validation layer, total recalculated), fail_practice_evaluation_attempt,
-- retry_practice_evaluation and private.compute_evaluation_total (tests/fixtures/practice/scoring-cases.json).
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

insert into public.products (id, organization_id, created_by, current_name)
values ('00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Curso de ventas');
insert into public.product_versions (id, organization_id, product_id, version, sector, name, description, price_kind,
  price_min, price_max, benefits, verifiable_facts, created_by)
values ('00000000-0000-4000-9200-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 1,
        'education', 'Curso de ventas', 'Curso de 8 semanas.', 'fixed', 1000, 1000, array['Certificado'],
        array['Más de 500 egresados'], '00000000-0000-4000-a000-000000000013');

create function pg_temp.auth_as(p_user uuid)
returns void
language plpgsql
as $$
declare
  v_sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (v_sid, p_user, now() - interval '1 minute', now(), 'aal1');
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', v_sid, 'aal', 'aal1')::text, true);
end;
$$;

create function pg_temp.err(p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_detail text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
  return v_state || '|' || coalesce(v_detail, '');
end;
$$;
grant execute on function pg_temp.err(text) to authenticated, service_role;

-- Finalized session of C with m1 (buyer), m2 (seller), m3 (buyer), m4 (seller), m5 (buyer).
create function pg_temp.finalized(p_id uuid, p_status public.evaluation_status, p_due interval default '3 minutes',
  p_auto int default 0, p_manual int default 0)
returns void
language plpgsql
as $$
begin
  insert into public.practice_sessions (id, organization_id, user_id, product_id, product_version_id, product_version,
    status, difficulty, hints_enabled, selected_objection_ids, visible_objection, interest, setup_idempotency_key,
    configured_at, configured_expires_at, started_at, deadline_at, last_seq,
    buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model)
  values (p_id, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
    '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', 1, 'active', 3, true,
    array[gen_random_uuid()], 'No tengo tiempo para estudiar.', 45, gen_random_uuid(),
    now() - interval '20 minutes', now() + interval '1 day', now() - interval '10 minutes', now() + interval '10 minutes', 1,
    'buyer-setup@1.0.0', 'buyer@1.0.0', 'm', 'm');
  insert into public.practice_buyer_profiles (session_id, organization_id, user_id, name, age, occupation, intro, goal, revealable_labels)
  values (p_id, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Lucía Ramos', 29,
    'Asistente', 'Trabaja en una distribuidora y quiere crecer.', 'Que se inscriba en la clase',
    array['budget', 'timeline', 'decision_maker']::public.revealable_key[]);
  insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables,
    hidden_objections, opening_message)
  values (p_id, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
    'Quiere un ascenso este año.', 'Práctica y algo desconfiada.',
    '[{"key": "budget", "value": "Entre S/ 800 y S/ 1 200", "budget_min": 800, "budget_max": 1200},
      {"key": "timeline", "value": "Este mes"}, {"key": "decision_maker", "value": "Ella misma"}]',
    '[{"id": "h1", "text": "La mensualidad está cara.", "source": "seller", "category": "price"}]', 'Hola, no sé si tengo tiempo.');
  insert into public.simulation_consumptions (session_id, organization_id, user_id)
  values (p_id, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013');
  insert into public.practice_messages (organization_id, user_id, session_id, seq, author, content, interest_after,
    meta_status, client_message_id)
  select '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', p_id, n,
         case when n % 2 = 0 then 'seller' else 'buyer' end::public.message_author,
         'Mensaje ' || n, case when n % 2 = 1 then 45 end,
         case when n % 2 = 1 then 'valid' end::public.turn_meta_status,
         case when n % 2 = 0 then gen_random_uuid() end
    from generate_series(1, 5) n;
  update public.practice_sessions
     set status = 'finalized', end_reason = 'seller_ended', ended_at = now(), last_seq = 5,
         seller_message_count = 2, evaluation_status = p_status,
         evaluation_due_at = case when p_status in ('pending', 'in_progress') then now() + p_due end,
         evaluation_auto_attempts = p_auto, evaluation_manual_retries = p_manual
   where id = p_id;
end;
$$;

-- A valid payload: every criterion evaluated with max − 2 (Σ 86 of 100); the proposed 99 is ignored.
create function pg_temp.payload()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'rubric_id', '00000000-0000-4000-8000-0000000000a1', 'prompt_version', 'evaluator@1.0.0', 'model', 'gemini-test',
    'total_score', 99,
    'criteria', (select jsonb_agg(jsonb_build_object(
        'key', c.key, 'status', 'evaluated', 'score', c.weight - 2, 'max_score', c.weight, 'evidence_seqs', jsonb_build_array(2),
        'justification', 'Lo hizo con claridad.', 'improvement', 'Pregunta más.', 'confidence', 0.8) order by c.position)
      from public.rubric_criteria c where c.rubric_id = '00000000-0000-4000-8000-0000000000a1'),
    'strengths', jsonb_build_array('Saludo cordial'), 'improvements', jsonb_build_array('Indagar el plazo'),
    'suggested_drill_text', 'Practica preguntas abiertas.', 'suggested_drill_stage', 'conoce',
    'ethical_flags', jsonb_build_array(jsonb_build_object('type', 'undue_pressure', 'explanation', 'Presionó.', 'message_seqs', jsonb_build_array(4))));
$$;

create temp table pl (k text primary key, v jsonb);
create temp table t (k text primary key, v jsonb);
grant select on pl to service_role, authenticated;
grant all on t to service_role, authenticated;

-- Grants -------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.claim_practice_evaluation(uuid)', 'execute'), 'claim: not for authenticated');
select ok(not has_function_privilege('authenticated', 'public.save_practice_evaluation(uuid, jsonb)', 'execute'), 'save: not for authenticated');
select ok(not has_function_privilege('authenticated', 'public.fail_practice_evaluation_attempt(uuid, text)', 'execute'), 'fail: not for authenticated');
select ok(not has_function_privilege('authenticated', 'public.set_practice_evaluation_phase(uuid, public.evaluation_phase)', 'execute'), 'phase: not for authenticated');
select ok(has_function_privilege('service_role', 'public.claim_practice_evaluation(uuid)', 'execute'), 'claim: service_role');
select ok(has_function_privilege('authenticated', 'public.retry_practice_evaluation(uuid)', 'execute'), 'retry: authenticated');
select ok(not has_function_privilege('anon', 'public.retry_practice_evaluation(uuid)', 'execute'), 'retry: not for anon');

-- compute_evaluation_total and score_level_for over the shared scoring cases ---------------------------
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 10, "max_score": 10}, {"status": "evaluated", "score": 20, "max_score": 20}, {"status": "evaluated", "score": 10, "max_score": 10}, {"status": "evaluated", "score": 20, "max_score": 20}, {"status": "evaluated", "score": 15, "max_score": 15}, {"status": "evaluated", "score": 15, "max_score": 15}, {"status": "evaluated", "score": 10, "max_score": 10}]}'::jsonb) t),
  '100|advanced', 'scoring: all evaluated, perfect');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 8, "max_score": 10}, {"status": "evaluated", "score": 15, "max_score": 20}, {"status": "no_evaluable", "score": null, "max_score": 10}, {"status": "evaluated", "score": 14, "max_score": 20}, {"status": "evaluated", "score": 9, "max_score": 15}, {"status": "evaluated", "score": 12, "max_score": 15}, {"status": "evaluated", "score": 7, "max_score": 10}]}'::jsonb) t),
  '72|developing', 'scoring: seed evaluation A1: one no_evaluable criterion renormalizes (65/90)');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 14, "max_score": 20}, {"status": "evaluated", "score": 15, "max_score": 20}, {"status": "no_evaluable", "score": null, "max_score": 10}]}'::jsonb) t),
  '73|developing', 'scoring: exact half rounds up (29/40 = 72.5)');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 60, "max_score": 100}, {"status": "evaluated", "score": 59, "max_score": 100}]}'::jsonb) t),
  '60|developing', 'scoring: just below a band (59.5 rounds to 60)');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 59, "max_score": 100}]}'::jsonb) t),
  '59|reinforcement', 'scoring: band edge 59');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 74, "max_score": 100}]}'::jsonb) t),
  '74|developing', 'scoring: band edge 74');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 75, "max_score": 100}]}'::jsonb) t),
  '75|competent', 'scoring: band edge 75');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 89, "max_score": 100}]}'::jsonb) t),
  '89|competent', 'scoring: band edge 89');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 90, "max_score": 100}]}'::jsonb) t),
  '90|advanced', 'scoring: band edge 90');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "evaluated", "score": 0, "max_score": 20}, {"status": "evaluated", "score": 0, "max_score": 10}]}'::jsonb) t),
  '0|reinforcement', 'scoring: all zero');
select is((select coalesce(t::text, '-') || '|' || coalesce(private.score_level_for(t)::text, '-')
             from private.compute_evaluation_total('{"criteria": [{"status": "no_evaluable", "score": null, "max_score": 20}, {"status": "no_evaluable", "score": null, "max_score": 10}]}'::jsonb) t),
  '-|-', 'scoring: nothing evaluable: no total and no level');

-- claim --------------------------------------------------------------------------------------------
select pg_temp.finalized('00000000-0000-4000-9000-000000000e01', 'pending');
select pg_temp.finalized('00000000-0000-4000-9000-000000000e02', 'failed');
select pg_temp.finalized('00000000-0000-4000-9000-000000000e03', 'pending', '-1 second');

set local role service_role;
insert into t select 'claim', public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e01');
reset role;
select ok((select v is not null from t where k = 'claim'), 'claim of a pending evaluation returns its input');
select is((select evaluation_status || '|' || evaluation_phase from public.practice_sessions where id = '00000000-0000-4000-9000-000000000e01'),
  'in_progress|reading', 'claim → in_progress, phase reading');
select is((select jsonb_array_length(v -> 'transcript') from t where k = 'claim'), 5, 'with the whole transcript');
select is((select jsonb_array_length(v -> 'rubric' -> 'criteria') from t where k = 'claim'), 7, 'with the current rubric');
select is((select v -> 'scenario' -> 'product' -> 'verifiableFacts' from t where k = 'claim'), '["Más de 500 egresados"]'::jsonb,
  'with the product version and its verifiable facts');
select ok((select v::text !~* '(email|full_name|@)' from t where k = 'claim'), 'without user data (FR-038)');
set local role service_role;
select is(public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e01'), null, 'second claim → NULL');
select is(public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e02'), null, 'failed evaluation → NULL');
select is(public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e03'), null, 'pending past its deadline → NULL');
select public.set_practice_evaluation_phase('00000000-0000-4000-9000-000000000e01', 'scoring');
reset role;
select is((select evaluation_phase::text from public.practice_sessions where id = '00000000-0000-4000-9000-000000000e01'),
  'scoring', 'set_practice_evaluation_phase');

-- save: second validation layer --------------------------------------------------------------------
insert into pl values
  ('valid', pg_temp.payload()),
  ('missing', jsonb_set(pg_temp.payload(), '{criteria}', (pg_temp.payload() -> 'criteria') - 6)),
  ('duplicate', jsonb_set(pg_temp.payload(), '{criteria,6}', pg_temp.payload() -> 'criteria' -> 0)),
  ('max', jsonb_set(pg_temp.payload(), '{criteria,0,max_score}', '11')),
  ('over', jsonb_set(pg_temp.payload(), '{criteria,0,score}', '11')),
  ('scored_no_eval', jsonb_set(pg_temp.payload(), '{criteria,0,status}', '"no_evaluable"')),
  ('no_evidence', jsonb_set(pg_temp.payload(), '{criteria,0,evidence_seqs}', '[]')),
  ('buyer_seq', jsonb_set(pg_temp.payload(), '{criteria,0,evidence_seqs}', '[3]')),
  ('missing_seq', jsonb_set(pg_temp.payload(), '{criteria,0,evidence_seqs}', '[99]')),
  ('flag_buyer', jsonb_set(pg_temp.payload(), '{ethical_flags,0,message_seqs}', '[1]'));

set local role service_role;
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'missing')) $$),
  '23514|criteria', 'missing criterion → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'duplicate')) $$),
  '23514|criteria', 'duplicate criterion → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'max')) $$),
  '23514|max_score', 'max_score ≠ weight → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'over')) $$),
  '23514|score', 'score over the maximum → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'scored_no_eval')) $$),
  '23514|score', 'score on a no_evaluable criterion → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'no_evidence')) $$),
  '23514|evidence', 'evaluated without evidence → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'buyer_seq')) $$),
  '23514|evidence', 'evidence citing a buyer message → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'missing_seq')) $$),
  '23514|evidence', 'evidence citing a nonexistent message → 23514');
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'flag_buyer')) $$),
  '23514|flags', 'flag citing a buyer message → 23514');

insert into t select 'saved', to_jsonb(public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'valid')));
reset role;
select ok((select v is not null from t where k = 'saved'), 'valid evaluation saved');
select is((select status || '|' || coalesce(evaluation_status::text, '-') || '|' || coalesce(evaluation_phase::text, '-')
             from public.practice_sessions where id = '00000000-0000-4000-9000-000000000e01'),
  'evaluated|-|-', 'session → evaluated, evaluation_status NULL');
select is((select total_score || '|' || level from public.practice_evaluations where session_id = '00000000-0000-4000-9000-000000000e01'),
  '86|competent', 'total and level recalculated (the proposed 99 is ignored)');
select is((select count(*)::int from public.practice_evaluation_criteria c join public.practice_evaluations e on e.id = c.evaluation_id
            where e.session_id = '00000000-0000-4000-9000-000000000e01'), 7, 'one row per criterion');
select is((select count(*)::int from public.practice_ethical_flags f join public.practice_evaluations e on e.id = f.evaluation_id
            where e.session_id = '00000000-0000-4000-9000-000000000e01'), 1, 'ethical flags saved');
select is((select prompt_version || '|' || model || '|' || auto_attempts || '|' || manual_retries
             from public.practice_evaluations where session_id = '00000000-0000-4000-9000-000000000e01'),
  'evaluator@1.0.0|gemini-test|1|0', 'prompt version, model and attempts recorded');
set local role service_role;
select is(pg_temp.err($$ select public.save_practice_evaluation('00000000-0000-4000-9000-000000000e01', (select v from pl where k = 'valid')) $$),
  'P0010|not_in_progress', 'saving twice → P0010 not_in_progress');
reset role;

-- fail_practice_evaluation_attempt ---------------------------------------------------------------------
select pg_temp.finalized('00000000-0000-4000-9000-000000000e04', 'pending');
select pg_temp.finalized('00000000-0000-4000-9000-000000000e05', 'in_progress', '30 seconds');
select pg_temp.finalized('00000000-0000-4000-9000-000000000e06', 'in_progress', '3 minutes', 2, 3);
set local role service_role;
select public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e04');
select is((select evaluation_status::text from public.fail_practice_evaluation_attempt('00000000-0000-4000-9000-000000000e04', 'invalid_output')),
  'pending', '1st failed attempt with time left → pending');
select public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e04');
select is((select evaluation_status::text from public.fail_practice_evaluation_attempt('00000000-0000-4000-9000-000000000e04', 'provider_error')),
  'pending', '2nd failed attempt → pending');
select public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e04');
select is((select evaluation_status::text from public.fail_practice_evaluation_attempt('00000000-0000-4000-9000-000000000e04', 'timeout')),
  'failed', '3rd failed attempt → failed');
select is((select evaluation_status::text from public.fail_practice_evaluation_attempt('00000000-0000-4000-9000-000000000e05', 'timeout')),
  'failed', 'less than 50 s left → failed');
select is((select evaluation_status::text from public.fail_practice_evaluation_attempt('00000000-0000-4000-9000-000000000e06', 'timeout')),
  'unavailable', 'after the 3rd manual retry → unavailable');
select is((select evaluation_status::text from public.fail_practice_evaluation_attempt('00000000-0000-4000-9000-000000000e02', 'timeout')),
  'failed', 'not in progress → unchanged');
reset role;
select is((select evaluation_auto_attempts || '|' || evaluation_failure_code || '|' || coalesce(evaluation_phase::text, '-')
             from public.practice_sessions where id = '00000000-0000-4000-9000-000000000e04'),
  '3|timeout|-', 'attempts and failure code recorded');

-- retry_practice_evaluation -----------------------------------------------------------------------------
select pg_temp.finalized('00000000-0000-4000-9000-000000000e07', 'failed', null, 3, 3);
insert into t select 'quota', to_jsonb(count(*)) from public.simulation_consumptions
 where organization_id = '00000000-0000-4000-b000-00000000000c';
select pg_temp.auth_as('00000000-0000-4000-a000-000000000013');
set local role authenticated;
select is((select manual_retries_left from public.retry_practice_evaluation('00000000-0000-4000-9000-000000000e02')),
  2, 'manual retry → 2 left');
select is(pg_temp.err($$ select * from public.retry_practice_evaluation('00000000-0000-4000-9000-000000000e02') $$),
  'P0010|not_failed', 'retry of a pending evaluation → P0010 not_failed');
select is(pg_temp.err($$ select * from public.retry_practice_evaluation('00000000-0000-4000-9000-000000000e07') $$),
  'P0010|retries_exhausted', 'after 3 retries → P0010 retries_exhausted');
reset role;
select is((select evaluation_status || '|' || evaluation_auto_attempts || '|' || evaluation_manual_retries || '|' || (evaluation_due_at > now())
             from public.practice_sessions where id = '00000000-0000-4000-9000-000000000e02'),
  'pending|0|1|true', 'retry → pending with a new deadline');
select is((select to_jsonb(count(*)) from public.simulation_consumptions where organization_id = '00000000-0000-4000-b000-00000000000c'),
  (select v from t where k = 'quota'), 'retrying does not consume quota');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;
select is(pg_temp.err($$ select * from public.retry_practice_evaluation('00000000-0000-4000-9000-000000000e07') $$),
  'P0002|', 'session of another seller → P0002');
reset role;

-- Suspended organization: nothing is claimed and the seller cannot retry.
select pg_temp.finalized('00000000-0000-4000-9000-000000000e08', 'pending');
update public.practice_sessions set evaluation_status = 'failed', evaluation_due_at = null
 where id = '00000000-0000-4000-9000-000000000e04';
update public.organizations set status = 'suspended', suspended_reason = 'x', suspended_at = now(),
  suspended_by = '00000000-0000-4000-a000-000000000001' where id = '00000000-0000-4000-b000-00000000000c';
set local role service_role;
select is(public.claim_practice_evaluation('00000000-0000-4000-9000-000000000e08'), null, 'suspended organization → not claimed');
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000013');
set local role authenticated;
select is(pg_temp.err($$ select * from public.retry_practice_evaluation('00000000-0000-4000-9000-000000000e04') $$),
  '42501|', 'suspended organization → 42501');
reset role;

select * from finish();
rollback;
