-- T170 — history and stage averages (FR-049, FR-050, FR-051): only started sessions of the caller,
-- newest first, filters (product, difficulty, dates in the org time zone), total_count and pages; the
-- stage averages count a shared criterion in each of its stages, leave stages without data NULL, only
-- use evaluated sessions and honor p_last_n.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- Seller E (org E, America/Lima; the seed leaves the membership suspended, reactivated here) with two
-- products; seller C (org C) owns one session.
update public.memberships set status = 'active', joined_at = coalesce(joined_at, now())
 where user_id = '00000000-0000-4000-a000-000000000015';
insert into public.products (id, organization_id, created_by, current_name)
values ('00000000-0000-4000-9100-000000000e01', '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-a000-000000000015', 'Lote'),
       ('00000000-0000-4000-9100-000000000e02', '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-a000-000000000015', 'Curso'),
       ('00000000-0000-4000-9100-000000000c09', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Otro');
insert into public.product_versions (id, organization_id, product_id, version, sector, name, price_kind, price_min, price_max, benefits, created_by)
values ('00000000-0000-4000-9200-000000000e01', '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-9100-000000000e01', 1,
        'real_estate', 'Lote v1', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000015'),
       ('00000000-0000-4000-9200-000000000e02', '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-9100-000000000e02', 1,
        'education', 'Curso v1', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000015'),
       ('00000000-0000-4000-9200-000000000c09', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c09', 1,
        'education', 'Otro v1', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000013');

-- A session of E: p_started is a Lima wall-clock timestamp.
create function pg_temp.s(p_id text, p_status public.practice_status, p_started timestamp, p_product text default 'e01',
  p_difficulty int default 3, p_eval public.evaluation_status default null,
  p_user uuid default '00000000-0000-4000-a000-000000000015', p_org uuid default '00000000-0000-4000-b000-00000000000e')
returns void
language sql
as $$
  insert into public.practice_sessions (id, organization_id, user_id, product_id, product_version_id, product_version,
    status, difficulty, selected_objection_ids, visible_objection, interest, setup_idempotency_key, configured_at,
    configured_expires_at, started_at, deadline_at, last_seq, seller_message_count, ended_at, end_reason,
    evaluation_status, buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model)
  values (('00000000-0000-4000-9000-0000000e' || p_id)::uuid, p_org, p_user,
    ('00000000-0000-4000-9100-000000000' || p_product)::uuid, ('00000000-0000-4000-9200-000000000' || p_product)::uuid, 1,
    p_status, p_difficulty, array[gen_random_uuid()], 'Objeción', 45, gen_random_uuid(),
    (p_started at time zone 'America/Lima') - interval '1 minute', now() + interval '1 day',
    case when p_status = 'configured' then null else p_started at time zone 'America/Lima' end,
    case when p_status = 'configured' then null else (p_started at time zone 'America/Lima') + interval '20 minutes' end,
    case when p_status = 'configured' then 0 else 3 end, case when p_status = 'configured' then 0 else 1 end,
    case when p_status in ('finalized', 'evaluated') then (p_started at time zone 'America/Lima') + interval '5 minutes' end,
    case when p_status in ('finalized', 'evaluated') then 'seller_ended'::public.practice_end_reason end,
    p_eval, 'v', 'v', 'm', 'm');
$$;

-- An evaluation with the given score per criterion key (missing keys → no_evaluable).
create function pg_temp.ev(p_id text, p_scores jsonb, p_total int)
returns void
language plpgsql
as $$
declare
  v_eval uuid := gen_random_uuid();
begin
  insert into public.practice_evaluations (id, organization_id, user_id, session_id, rubric_id, rubric_version,
    prompt_version, model, total_score, level, strengths, improvements, suggested_drill_text, suggested_drill_stage,
    auto_attempts, manual_retries)
  values (v_eval, '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-a000-000000000015',
    ('00000000-0000-4000-9000-0000000e' || p_id)::uuid, '00000000-0000-4000-8000-0000000000a1', '1.0', 'evaluator@1.0.0',
    'm', p_total, private.score_level_for(p_total), array['F'], array['M'], 'Practica.', 'innova', 1, 0);
  insert into public.practice_evaluation_criteria (organization_id, user_id, evaluation_id, criterion_id, status, score,
    max_score, evidence_seqs, justification, improvement, confidence)
  select '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-a000-000000000015', v_eval, rc.id,
         case when p_scores ? rc.key then 'evaluated' else 'no_evaluable' end::public.criterion_status,
         (p_scores ->> rc.key)::int, rc.weight, case when p_scores ? rc.key then array[2] else array[]::int[] end,
         'J', case when p_scores ? rc.key then 'M' else '' end, 0.8
    from public.rubric_criteria rc where rc.rubric_id = '00000000-0000-4000-8000-0000000000a1';
end;
$$;

-- Timeline (Lima): 01 evaluated 2026-11-01 23:30 (UTC: Nov 2), 02 finalized failed 11-05, 03 active 11-10
-- (Curso, difficulty 5), 04 evaluated 11-12, configured and discarded ones, and one session of seller C.
select pg_temp.s('0001', 'evaluated', '2026-11-01 23:30');
select pg_temp.s('0002', 'finalized', '2026-11-05 10:00', p_eval => 'failed');
select pg_temp.s('0003', 'active', '2026-11-10 10:00', 'e02', 5);
select pg_temp.s('0004', 'evaluated', '2026-11-12 10:00');
select pg_temp.s('0005', 'finalized', '2026-11-13 10:00', p_eval => 'unavailable');
select pg_temp.s('0006', 'configured', '2026-11-14 10:00');
update public.practice_sessions set status = 'discarded', discarded_at = now()
 where id = '00000000-0000-4000-9000-0000000e0006';
select pg_temp.s('0007', 'configured', '2026-11-15 10:00');
select pg_temp.s('0008', 'evaluated', '2026-11-03 10:00', 'c09', 3, null,
  '00000000-0000-4000-a000-000000000013', '00000000-0000-4000-b000-00000000000c');
-- 01: value_argument (aumenta + transforma) 10/20 = 50 %, diagnosis (conoce) 20/20 = 100 %.
select pg_temp.ev('0001', '{"value_argument": 10, "diagnosis": 20}', 75);
-- 04: value_argument 20/20, first_impression (conoce) 5/10 = 50 %.
select pg_temp.ev('0004', '{"value_argument": 20, "first_impression": 5}', 83);

select pg_temp.auth_as('00000000-0000-4000-a000-000000000015');
set local role authenticated;

select results_eq(
  $$ select right(session_id::text, 4) from public.my_practice_history() $$,
  $$ values ('0005'), ('0004'), ('0003'), ('0002'), ('0001') $$,
  'only started sessions of the caller, newest first (no configured, discarded or foreign ones)');
select is((select total_count::int from public.my_practice_history() limit 1), 5, 'total_count of the filtered set');
select results_eq(
  $$ select right(session_id::text, 4) from public.my_practice_history(p_limit => 2, p_offset => 2) $$,
  $$ values ('0003'), ('0002') $$, 'pagination with limit/offset');
select is((select total_count::int from public.my_practice_history(p_limit => 2, p_offset => 2) limit 1), 5,
  'total_count ignores the page');
select is((select product_name || ' v' || product_version || ' d' || difficulty || ' ' || status
             from public.my_practice_history(p_product => '00000000-0000-4000-9100-000000000e02')),
  'Curso v1 v1 d5 active', 'product filter; product name of the version used');
select results_eq($$ select right(session_id::text, 4) from public.my_practice_history(p_difficulty => 5::smallint) $$,
  $$ values ('0003') $$, 'difficulty filter');
select results_eq(
  $$ select right(session_id::text, 4) from public.my_practice_history(p_from => '2026-11-01', p_to => '2026-11-01') $$,
  $$ values ('0001') $$, 'dates in the organization time zone (23:30 Lima is still Nov 1)');
select is((select count(*)::int from public.my_practice_history(p_from => '2026-11-11', p_to => '2026-11-12')), 1,
  'date range is inclusive');
select is((select total_score || ' ' || level from public.my_practice_history() where right(session_id::text, 4) = '0004'),
  '83 competent', 'total and level of evaluated sessions');
select is((select evaluation_status::text from public.my_practice_history() where right(session_id::text, 4) = '0002'),
  'failed', 'evaluation status of finalized sessions');

select results_eq(
  $$ select stage::text, avg_pct, evaluated_criteria from public.my_practice_stage_averages() $$,
  $$ values ('conoce', 75.0::numeric, 2), ('aumenta', 75.0::numeric, 2), ('une', null::numeric, 0),
            ('transforma', 75.0::numeric, 2), ('innova', null::numeric, 0), ('vende', null::numeric, 0),
            ('asegura', null::numeric, 0) $$,
  'shared criterion counts in aumenta and transforma; stages without data are NULL; canonical order');
select results_eq(
  $$ select stage::text, avg_pct from public.my_practice_stage_averages(p_last_n => 1) where avg_pct is not null $$,
  $$ values ('conoce', 50.0::numeric), ('aumenta', 100.0::numeric), ('transforma', 100.0::numeric) $$,
  'p_last_n uses only the last evaluated sessions');
select is((select avg_pct from public.my_practice_stage_averages(p_to => '2026-11-01') where stage = 'aumenta'), 50.0,
  'filters apply to the averages');
select is((select count(*)::int from public.my_practice_stage_averages(p_product => '00000000-0000-4000-9100-000000000e02')
             where avg_pct is not null), 0, 'no evaluated sessions → every stage without data');

reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000013');
set local role authenticated;
select results_eq($$ select right(session_id::text, 4) from public.my_practice_history() $$,
  $$ select right(id::text, 4) from public.practice_sessions
      where user_id = '00000000-0000-4000-a000-000000000013' and status in ('active', 'finalized', 'evaluated')
      order by started_at desc, id desc $$,
  'another user sees only their own sessions');
reset role;

select throws_ok($$ set local role anon; select * from public.my_practice_history() $$, '42501', null,
  'anon cannot call the history');

select * from finish();
rollback;
