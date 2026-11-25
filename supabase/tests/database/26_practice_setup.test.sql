-- T067 — practice setup and start (contracts/database-rpc.md; FR-009–FR-019): check_practice_setup
-- order (P0022 → P0020 → P0021 → product → objections), create_configured_practice (idempotent,
-- discards the previous configured one, P0022, budget 70–130 %, success attempt),
-- record_practice_setup_failure, start_practice_session (consumes once, already_active, expired,
-- quota without consumption, m1, deadline, initial interest, second active → P0022),
-- practice_quota_status(), maintenance v1 and the practice-maintenance cron job.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- Seller C (org c, no seeded practice data) in America/Lima with quota 2/day, 5/month.
update public.organizations set timezone = 'America/Lima' where id = '00000000-0000-4000-b000-00000000000c';
update public.quotas set daily_limit = 2, monthly_limit = 5 where organization_id = '00000000-0000-4000-b000-00000000000c';

-- Product of C (fixed price 1000) with three objections, plus an archived one.
insert into public.products (id, organization_id, created_by, current_name)
values ('00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Curso de ventas'),
       ('00000000-0000-4000-9100-000000000c02', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Curso archivado');
insert into public.product_versions (id, organization_id, product_id, version, sector, name, description, price_kind,
  price_min, price_max, benefits, created_by)
values ('00000000-0000-4000-9200-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 1,
        'education', 'Curso de ventas', 'Curso de 8 semanas.', 'fixed', 1000, 1000, array['Certificado'], '00000000-0000-4000-a000-000000000013'),
       ('00000000-0000-4000-9200-000000000c02', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c02', 1,
        'education', 'Curso archivado', '', 'fixed', 500, 500, array['Certificado'], '00000000-0000-4000-a000-000000000013');
update public.products set status = 'archived', archived_at = now() where id = '00000000-0000-4000-9100-000000000c02';
insert into public.objections (id, organization_id, product_id, text, category)
values ('00000000-0000-4000-9300-000000000c11', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 'La mensualidad está cara.', 'price'),
       ('00000000-0000-4000-9300-000000000c12', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 'No tengo tiempo para estudiar.', 'time'),
       ('00000000-0000-4000-9300-000000000c13', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 'Mis papás deciden.', 'decision_maker'),
       ('00000000-0000-4000-9300-000000000c21', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c02', 'Objeción del archivado.', null);

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

-- SQLSTATE|DETAIL of a failing statement (or 'ok').
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

-- Valid payload for create_configured_practice (budget 700–1300 for price 1000).
create function pg_temp.payload(p_key uuid, p_patch jsonb default '{}')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'setup_idempotency_key', p_key,
    'product_id', '00000000-0000-4000-9100-000000000c01',
    'product_version_id', '00000000-0000-4000-9200-000000000c01',
    'objection_ids', jsonb_build_array('00000000-0000-4000-9300-000000000c11', '00000000-0000-4000-9300-000000000c12'),
    'visible_objection_id', '00000000-0000-4000-9300-000000000c12',
    'generated_hidden_objection', null,
    'difficulty', 3,
    'hints_enabled', true,
    'focus_stage', 'innova',
    'buyer', jsonb_build_object('name', 'Lucía Ramos', 'age', 29, 'occupation', 'Asistente administrativa',
      'intro', 'Trabaja en una distribuidora y quiere crecer en el área comercial.',
      'goal', 'Que se inscriba en la próxima clase de prueba',
      'motivation', 'Quiere un ascenso este año.', 'personality', 'Práctica y algo desconfiada.'),
    'revealables', jsonb_build_object(
      'budget', jsonb_build_object('amount_min', 700, 'amount_max', 1300, 'display', 'Entre S/ 700 y S/ 1 300'),
      'timeline', jsonb_build_object('display', 'Este mes'),
      'decision_maker', jsonb_build_object('display', 'Ella misma')),
    'opening_message', 'Hola, vi el curso pero la verdad no sé si tengo tiempo para estudiar.',
    'buyer_setup_prompt_version', 'buyer-setup@1.0.0',
    'buyer_prompt_version', 'buyer@1.0.0',
    'buyer_setup_model', 'fake-buyer_setup',
    'buyer_model', 'fake-buyer'
  ) || p_patch;
$$;
grant execute on function pg_temp.payload(uuid, jsonb) to service_role;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role;

-- ------------------------------------------------------------------------------ grants
select ok(not has_function_privilege('authenticated', 'public.create_configured_practice(uuid, jsonb)', 'execute'), 'authenticated cannot create configured practices');
select ok(not has_function_privilege('anon', 'public.check_practice_setup(uuid, uuid[])', 'execute'), 'anon cannot check setups');
select ok(has_function_privilege('service_role', 'public.record_practice_setup_failure(uuid, text)', 'execute'), 'service_role records setup failures');
select ok(not has_function_privilege('authenticated', 'public.record_practice_setup_failure(uuid, text)', 'execute'), 'authenticated cannot record setup failures');

-- ------------------------------------------------------------------------------ check_practice_setup
select pg_temp.auth_as('00000000-0000-4000-a000-000000000013');
set local role authenticated;

select results_eq(
  $$ select product_version_id::text, sector::text, objections from public.check_practice_setup(
       '00000000-0000-4000-9100-000000000c01',
       array['00000000-0000-4000-9300-000000000c12', '00000000-0000-4000-9300-000000000c11']::uuid[]) $$,
  $$ values ('00000000-0000-4000-9200-000000000c01', 'education',
       '[{"id": "00000000-0000-4000-9300-000000000c12", "text": "No tengo tiempo para estudiar.", "category": "time"},
         {"id": "00000000-0000-4000-9300-000000000c11", "text": "La mensualidad está cara.", "category": "price"}]'::jsonb) $$,
  'returns the current version, sector and objections in the chosen order'
);
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c01', array['00000000-0000-4000-9300-000000000c21']::uuid[]) $$),
  'P0002|', 'objection of another product → P0002');
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000a01', array['00000000-0000-4000-9300-000000000a11']::uuid[]) $$),
  'P0002|', 'product of another organization → P0002');
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c02', array['00000000-0000-4000-9300-000000000c21']::uuid[]) $$),
  'P0010|product_archived', 'archived product → P0010 product_archived');
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c01', array['00000000-0000-4000-9300-000000000c11', '00000000-0000-4000-9300-000000000c11']::uuid[]) $$),
  'P0002|', 'duplicated objections → P0002');
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c01', '{}'::uuid[]) $$),
  'P0002|', 'no objections → P0002');

-- Caps (30 successes / 30 failures today) → P0021 with retry_at at local midnight.
reset role;
insert into public.practice_setup_attempts (organization_id, user_id, outcome, created_at)
select '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'success', now() from generate_series(1, 30);
set local role authenticated;
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c01', array['00000000-0000-4000-9300-000000000c11']::uuid[]) $$),
  'P0021|success:' || to_char((date_trunc('day', now() at time zone 'America/Lima') + interval '1 day') at time zone 'America/Lima' at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  '30 successful setups today → P0021 success:<next local midnight>');
reset role;
delete from public.practice_setup_attempts where user_id = '00000000-0000-4000-a000-000000000013';
insert into public.practice_setup_attempts (organization_id, user_id, outcome, failure_code, created_at)
select '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'failure', 'provider_unavailable', now() from generate_series(1, 30);
-- Attempts of yesterday (local) do not count.
insert into public.practice_setup_attempts (organization_id, user_id, outcome, created_at)
select '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'success',
       (date_trunc('day', now() at time zone 'America/Lima') - interval '1 minute') at time zone 'America/Lima' from generate_series(1, 30);
set local role authenticated;
select ok(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c01', array['00000000-0000-4000-9300-000000000c11']::uuid[]) $$)
  like 'P0021|failure:%', '30 failed setups today → P0021 failure:<retry_at> (yesterday does not count)');
reset role;
delete from public.practice_setup_attempts where user_id = '00000000-0000-4000-a000-000000000013';

-- Quota disabled beats caps and product checks.
update public.quotas set daily_limit = 0 where organization_id = '00000000-0000-4000-b000-00000000000c';
set local role authenticated;
select is(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c02', array['00000000-0000-4000-9300-000000000c21']::uuid[]) $$),
  'P0020|disabled', 'quota disabled → P0020 disabled (before the product check)');
reset role;
update public.quotas set daily_limit = 2 where organization_id = '00000000-0000-4000-b000-00000000000c';

-- ------------------------------------------------------------------------------ create_configured_practice
set local role service_role;
insert into t select 's1', session_id::text from public.create_configured_practice(
  '00000000-0000-4000-a000-000000000013', pg_temp.payload('00000000-0000-4000-8000-00000000d001'));
select results_eq(
  $$ select session_id::text, duplicate from public.create_configured_practice(
       '00000000-0000-4000-a000-000000000013', pg_temp.payload('00000000-0000-4000-8000-00000000d001')) $$,
  $$ select v, true from t where k = 's1' $$,
  'same setup key → same session, duplicate = true'
);
reset role;
select results_eq(
  $$ select status::text, difficulty::int, interest::int, visible_objection, visible_objection_category::text, focus_stage::text,
            product_version, configured_expires_at - configured_at
       from public.practice_sessions where id = (select v::uuid from t where k = 's1') $$,
  $$ values ('configured', 3, 45, 'No tengo tiempo para estudiar.', 'time', 'innova', 1, interval '24 hours') $$,
  'configured session with copies, initial interest and 24 h expiry'
);
select is(
  (select hidden_objections from public.practice_session_secrets where session_id = (select v::uuid from t where k = 's1')),
  '[{"id": "h1", "text": "La mensualidad está cara.", "source": "seller", "category": "price"}]'::jsonb,
  'the other chosen objection is hidden (h1, source seller)'
);
select is(
  (select revealables -> 0 from public.practice_session_secrets where session_id = (select v::uuid from t where k = 's1')),
  '{"key": "budget", "value": "Entre S/ 700 y S/ 1 300", "budget_max": 1300, "budget_min": 700}'::jsonb,
  'budget revealable stored with its bounds'
);
select results_eq(
  $$ select name, age::int, revealable_labels::text[] from public.practice_buyer_profiles where session_id = (select v::uuid from t where k = 's1') $$,
  $$ values ('Lucía Ramos', 29, array['budget', 'timeline', 'decision_maker']) $$,
  'public buyer profile'
);
select is((select count(*)::int from public.practice_setup_attempts where user_id = '00000000-0000-4000-a000-000000000013' and outcome = 'success'),
  1, 'one success attempt (the idempotent repeat does not add another)');
select is((select count(*)::int from public.simulation_consumptions where user_id = '00000000-0000-4000-a000-000000000013'),
  0, 'configuring does not consume quota');

set local role service_role;
select is(pg_temp.err($$ select * from public.create_configured_practice('00000000-0000-4000-a000-000000000013',
    pg_temp.payload(gen_random_uuid(), jsonb_build_object('revealables', jsonb_build_object(
      'budget', jsonb_build_object('amount_min', 699, 'amount_max', 1000, 'display', 'S/ 699'),
      'timeline', jsonb_build_object('display', 'Ya'), 'decision_maker', jsonb_build_object('display', 'Ella'))))) $$),
  '23514|budget', 'budget below 70 % of the price → 23514');
select is(pg_temp.err($$ select * from public.create_configured_practice('00000000-0000-4000-a000-000000000013',
    pg_temp.payload(gen_random_uuid(), jsonb_build_object('revealables', jsonb_build_object(
      'budget', jsonb_build_object('amount_min', 900, 'amount_max', 1301, 'display', 'S/ 1 301'),
      'timeline', jsonb_build_object('display', 'Ya'), 'decision_maker', jsonb_build_object('display', 'Ella'))))) $$),
  '23514|budget', 'budget above 130 % of the price → 23514');
select is(pg_temp.err($$ select * from public.create_configured_practice('00000000-0000-4000-a000-000000000013',
    pg_temp.payload(gen_random_uuid(), '{"objection_ids": ["00000000-0000-4000-9300-000000000c11"], "visible_objection_id": "00000000-0000-4000-9300-000000000c11"}')) $$),
  '23514|generated_hidden_objection', 'one objection without a generated hidden one → 23514');
select is(pg_temp.err($$ select * from public.create_configured_practice('00000000-0000-4000-a000-000000000013',
    pg_temp.payload(gen_random_uuid(), '{"buyer": {"name": "X", "age": 30}}')) $$),
  '23514|name', 'invalid buyer field → 23514 with the field');
select is(pg_temp.err($$ select * from public.create_configured_practice('00000000-0000-4000-a000-000000000011', pg_temp.payload(gen_random_uuid())) $$),
  'P0002|', 'product of another seller → P0002');

-- A new configuration discards the previous one; one objection + generated hidden objection.
insert into t select 's2', session_id::text from public.create_configured_practice(
  '00000000-0000-4000-a000-000000000013', pg_temp.payload('00000000-0000-4000-8000-00000000d002',
  '{"objection_ids": ["00000000-0000-4000-9300-000000000c13"], "visible_objection_id": "00000000-0000-4000-9300-000000000c13",
    "generated_hidden_objection": {"text": "  No sé si el certificado vale.  ", "category": "trust"}, "difficulty": 5, "focus_stage": null}'));
reset role;
select is((select status::text from public.practice_sessions where id = (select v::uuid from t where k = 's1')), 'discarded',
  'the previous configured session is discarded');
select results_eq(
  $$ select s.interest::int, sec.hidden_objections from public.practice_sessions s
       join public.practice_session_secrets sec on sec.session_id = s.id where s.id = (select v::uuid from t where k = 's2') $$,
  $$ values (25, '[{"id": "h1", "text": "No sé si el certificado vale.", "source": "generated", "category": "trust"}]'::jsonb) $$,
  'difficulty 5 → interest 25; generated hidden objection stored trimmed'
);

-- record_practice_setup_failure.
set local role service_role;
select lives_ok($$ select public.record_practice_setup_failure('00000000-0000-4000-a000-000000000013', 'invalid_persona') $$, 'record a failure');
select is(pg_temp.err($$ select public.record_practice_setup_failure('00000000-0000-4000-a000-000000000013', 'boom') $$),
  '22023|', 'unknown failure code → 22023');
reset role;

-- ------------------------------------------------------------------------------ practice_quota_status()
set local role authenticated;
select results_eq(
  $$ select daily_used, daily_limit, monthly_used, monthly_limit, remaining_today, remaining_month, exhausted_scope,
            setup_success_today, setup_failure_today, setup_retry_at from public.practice_quota_status() $$,
  $$ values (0, 2, 0, 5, 2, 5, null::text, 2, 1, null::timestamptz) $$,
  'quota and setup counters of the personal organization'
);

-- ------------------------------------------------------------------------------ start_practice_session
select results_eq(
  $$ select session_id::text, already_active from public.start_practice_session((select v::uuid from t where k = 's2')) $$,
  $$ select v, false from t where k = 's2' $$,
  'start → already_active = false'
);
select results_eq(
  $$ select session_id::text, already_active from public.start_practice_session((select v::uuid from t where k = 's2')) $$,
  $$ select v, true from t where k = 's2' $$,
  'start again (double click) → already_active = true'
);
reset role;
select is((select count(*)::int from public.simulation_consumptions where session_id = (select v::uuid from t where k = 's2')), 1,
  'exactly one consumption');
select results_eq(
  $$ select status::text, last_seq, interest::int, deadline_at - started_at, started_at is not null
       from public.practice_sessions where id = (select v::uuid from t where k = 's2') $$,
  $$ values ('active', 1, 25, interval '20 minutes', true) $$,
  'active with last_seq 1, initial interest and a 20 minute deadline'
);
select results_eq(
  $$ select seq, author::text, content, interest_after::int, meta_status::text from public.practice_messages
      where session_id = (select v::uuid from t where k = 's2') $$,
  $$ values (1, 'buyer', 'Hola, vi el curso pero la verdad no sé si tengo tiempo para estudiar.', 25, 'valid') $$,
  'm1 is the opening message'
);
set local role authenticated;
select ok(pg_temp.err($$ select * from public.check_practice_setup('00000000-0000-4000-9100-000000000c02', array['00000000-0000-4000-9300-000000000c21']::uuid[]) $$)
  = 'P0022|' || (select v from t where k = 's2'), 'with an active session check_practice_setup → P0022 first, with its id');
select is((select remaining_today from public.practice_quota_status()), 1, 'one simulation left today');
reset role;

set local role service_role;
select is(pg_temp.err($$ select * from public.create_configured_practice('00000000-0000-4000-a000-000000000013', pg_temp.payload(gen_random_uuid())) $$),
  'P0022|' || (select v from t where k = 's2'), 'create with an active session → P0022');
reset role;

-- Second active: a configured session (inserted directly) cannot start while s2 is active.
insert into public.practice_sessions (id, organization_id, user_id, product_id, product_version_id, product_version, difficulty,
  selected_objection_ids, visible_objection, interest, setup_idempotency_key, configured_expires_at,
  buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model)
values ('00000000-0000-4000-9000-000000000c03', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', 1, 2, array['00000000-0000-4000-9300-000000000c11']::uuid[],
  'La mensualidad está cara.', 50, gen_random_uuid(), now() + interval '1 hour', 'v', 'v', 'm', 'm');
set local role authenticated;
select is(pg_temp.err($$ select * from public.start_practice_session('00000000-0000-4000-9000-000000000c03') $$),
  'P0022|' || (select v from t where k = 's2'), 'start while another session is active → P0022');
reset role;

-- Finish s2 (direct update) so the next starts are about expiry and quota.
update public.practice_sessions set status = 'finalized', end_reason = 'seller_ended', ended_at = now(),
  evaluation_status = 'not_applicable' where id = (select v::uuid from t where k = 's2');
update public.practice_sessions set configured_at = now() - interval '25 hours', configured_expires_at = now() - interval '1 hour'
 where id = '00000000-0000-4000-9000-000000000c03';
set local role authenticated;
select is(pg_temp.err($$ select * from public.start_practice_session('00000000-0000-4000-9000-000000000c03') $$),
  'P0010|expired', 'expired configured session → P0010 expired');
select is(pg_temp.err($$ select * from public.start_practice_session(gen_random_uuid()) $$), 'P0002|', 'unknown session → P0002');
reset role;

-- Quota exhausted between configure and start: P0020 and nothing consumed.
update public.practice_sessions set configured_at = now(), configured_expires_at = now() + interval '1 hour'
 where id = '00000000-0000-4000-9000-000000000c03';
insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables,
  hidden_objections, opening_message)
values ('00000000-0000-4000-9000-000000000c03', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
  'Motivación de prueba.', 'Personalidad de prueba.', '[{"key": "timeline", "value": "Pronto"}]', '[{"id": "h1", "text": "Oculta de prueba.", "source": "generated"}]', 'Hola.');
update public.quotas set daily_limit = 1 where organization_id = '00000000-0000-4000-b000-00000000000c';
set local role authenticated;
select ok(pg_temp.err($$ select * from public.start_practice_session('00000000-0000-4000-9000-000000000c03') $$) like 'P0020|daily:%',
  'daily quota used up → P0020 daily:<renews_at>');
reset role;
select results_eq(
  $$ select (select count(*)::int from public.simulation_consumptions where user_id = '00000000-0000-4000-a000-000000000013'),
            (select status::text from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c03') $$,
  $$ values (1, 'configured') $$,
  'no consumption and the configured session stays available'
);

-- Another user cannot start it (P0002, no disclosure).
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;
select is(pg_temp.err($$ select * from public.start_practice_session('00000000-0000-4000-9000-000000000c03') $$), 'P0002|',
  'session of another user → P0002');
reset role;

-- ------------------------------------------------------------------------------ maintenance v1
update public.practice_sessions set configured_at = now() - interval '25 hours', configured_expires_at = now() - interval '1 hour'
 where id = '00000000-0000-4000-9000-000000000c03';
insert into public.practice_setup_attempts (organization_id, user_id, outcome, created_at)
values ('00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'success', now() - interval '41 days'),
       ('00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'success', now() - interval '39 days');
select lives_ok($$ select private.run_practice_maintenance() $$, 'maintenance runs');
select results_eq(
  $$ select status::text, discarded_at is not null from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c03' $$,
  $$ values ('discarded', true) $$,
  'configured sessions past 24 h are discarded'
);
select is((select count(*)::int from public.practice_setup_attempts where created_at < now() - interval '40 days'), 0,
  'attempts older than 40 days are purged');
select is((select count(*)::int from public.practice_setup_attempts where created_at between now() - interval '40 days' and now() - interval '38 days'), 1,
  'recent attempts are kept');
select is((select schedule from cron.job where jobname = 'practice-maintenance'), '* * * * *', 'practice-maintenance runs every minute');

select * from finish();
rollback;
