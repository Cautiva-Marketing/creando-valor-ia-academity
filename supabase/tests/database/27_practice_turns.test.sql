-- T092 — practice turns (contracts/database-rpc.md; data-model.md → apply_turn_rules; FR-020–FR-034,
-- SC-009): begin_practice_turn, commit_practice_turn, release_practice_turn, finish_practice_session,
-- request_practice_hint, get_practice_turn_context and private.apply_turn_rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

-- Seller C (org c) with a product (fixed price 1000) and one objection.
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

-- Active session of C (with m1, persona and secrets). Only one can be active at a time.
create function pg_temp.active(p_id uuid, p_interest int, p_hints boolean default true, p_deadline interval default '20 minutes')
returns void
language plpgsql
as $$
begin
  insert into public.practice_sessions (id, organization_id, user_id, product_id, product_version_id, product_version,
    status, difficulty, hints_enabled, selected_objection_ids, visible_objection, interest, setup_idempotency_key,
    configured_at, configured_expires_at, started_at, deadline_at, last_seq,
    buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model)
  values (p_id, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
    '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', 1, 'active', 3, p_hints,
    array[gen_random_uuid()], 'No tengo tiempo para estudiar.', p_interest, gen_random_uuid(),
    now() - interval '10 minutes', now() + interval '1 day', now() - interval '1 minute', now() + p_deadline, 1,
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
  insert into public.practice_messages (organization_id, user_id, session_id, seq, author, content, interest_after, meta_status)
  values ('00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', p_id, 1, 'buyer',
    'Hola, no sé si tengo tiempo.', p_interest, 'valid');
end;
$$;

create function pg_temp.finish(p_id uuid)
returns void
language sql
as $$
  update public.practice_sessions set status = 'finalized', end_reason = 'seller_ended', ended_at = now(),
    turn_lock_seq = null, turn_lock_expires_at = null, evaluation_status = 'not_applicable' where id = p_id;
$$;

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated, service_role;

-- ------------------------------------------------------------------------------ apply_turn_rules
select results_eq($$ select * from private.apply_turn_rules(45, 2, -40, false, false, null) $$,
  $$ values (30, -15, null::public.practice_end_reason, true) $$, 'delta clamped to ±15 → corrected');
select results_eq($$ select * from private.apply_turn_rules(20, 3, -15, false, false, null) $$,
  $$ values (11, -9, null::public.practice_end_reason, false) $$, 'floor of 11 in the first 3 seller messages');
select results_eq($$ select * from private.apply_turn_rules(20, 3, -15, true, false, null) $$,
  $$ values (5, -15, 'buyer_abandoned'::public.practice_end_reason, false) $$, 'abusive seller: no floor and abandonment');
select results_eq($$ select * from private.apply_turn_rules(20, 4, -15, false, false, null) $$,
  $$ values (5, -15, 'buyer_abandoned'::public.practice_end_reason, false) $$, 'interest ≤ 10 from the 4th message → abandonment');
select results_eq($$ select * from private.apply_turn_rules(70, 5, 5, false, true, 'goal_achieved') $$,
  $$ values (75, 5, null::public.practice_end_reason, true) $$, 'goal below 80 is ignored → corrected');
select results_eq($$ select * from private.apply_turn_rules(78, 5, 5, false, true, 'goal_achieved') $$,
  $$ values (83, 5, 'goal_achieved'::public.practice_end_reason, false) $$, 'goal with interest ≥ 80 closes');
select results_eq($$ select * from private.apply_turn_rules(50, 20, 0, false, false, null) $$,
  $$ values (50, 0, 'message_limit'::public.practice_end_reason, false) $$, '20th seller message → message_limit');
select results_eq($$ select * from private.apply_turn_rules(50, 6, 0, false, true, 'buyer_abandoned') $$,
  $$ values (50, 0, null::public.practice_end_reason, true) $$, 'abandonment claimed with high interest is ignored');
select results_eq($$ select * from private.apply_turn_rules(95, 6, 15, false, false, null) $$,
  $$ values (100, 5, null::public.practice_end_reason, false) $$, 'interest stays within 0–100');

-- ------------------------------------------------------------------------------ grants
select ok(not has_function_privilege('authenticated', 'public.get_practice_turn_context(uuid, uuid)', 'execute'), 'authenticated cannot read the turn context');
select ok(not has_function_privilege('authenticated', 'public.commit_practice_turn(uuid, uuid, int, text, jsonb, public.turn_meta_status, int)', 'execute'), 'authenticated cannot commit turns');
select ok(not has_function_privilege('authenticated', 'public.release_practice_turn(uuid, uuid, int, int)', 'execute'), 'authenticated cannot release turns');
select ok(not has_function_privilege('anon', 'public.begin_practice_turn(uuid, uuid, text)', 'execute'), 'anon cannot begin turns');

-- ------------------------------------------------------------------------------ session S: begin / commit
select pg_temp.active('00000000-0000-4000-9000-000000000c11', 45);
select pg_temp.auth_as('00000000-0000-4000-a000-000000000013');
set local role authenticated;

select results_eq(
  $$ select seller_seq, already_answered, buyer_seq, closed from public.begin_practice_turn(
       '00000000-0000-4000-9000-000000000c11', '00000000-0000-4000-8000-0000000c0001', '  Hola, ¿qué buscas?  ') $$,
  $$ values (2, false, null::int, false) $$, 'begin stores the seller message before the AI (seq 2)');
select results_eq(
  $$ select seller_seq, already_answered from public.begin_practice_turn(
       '00000000-0000-4000-9000-000000000c11', '00000000-0000-4000-8000-0000000c0001', 'Hola, ¿qué buscas?') $$,
  $$ values (2, false) $$, 'same client message id without reply → same seq (retry)');
select is(pg_temp.err($$ select * from public.begin_practice_turn('00000000-0000-4000-9000-000000000c11', gen_random_uuid(), 'Otro mensaje') $$),
  'P0010|turn_in_progress', 'another message while the lease is held → turn_in_progress');
reset role;
select results_eq(
  $$ select content, author::text, seller_message_count::int, turn_lock_seq, turn_lock_expires_at > now() + interval '80 seconds'
       from public.practice_messages m join public.practice_sessions s on s.id = m.session_id
      where m.session_id = '00000000-0000-4000-9000-000000000c11' and m.seq = 2 $$,
  $$ values ('Hola, ¿qué buscas?', 'seller', 1, 2, true) $$, 'trimmed, counted once, lease of 90 s on seq 2');
update public.practice_sessions set turn_lock_expires_at = now() - interval '1 second' where id = '00000000-0000-4000-9000-000000000c11';
set local role authenticated;
select is(pg_temp.err($$ select * from public.begin_practice_turn('00000000-0000-4000-9000-000000000c11', gen_random_uuid(), '   ') $$),
  '23514|text', 'blank text → 23514');
reset role;
update public.practice_sessions set turn_lock_expires_at = now() + interval '90 seconds' where id = '00000000-0000-4000-9000-000000000c11';

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;
select is(pg_temp.err($$ select * from public.begin_practice_turn('00000000-0000-4000-9000-000000000c11', gen_random_uuid(), 'Hola') $$),
  'P0002|', 'session of another seller → P0002');
reset role;

set local role service_role;
insert into t select 'c1', to_jsonb(r) from public.commit_practice_turn(
  '00000000-0000-4000-a000-000000000013', '00000000-0000-4000-9000-000000000c11', 2,
  'Busco algo que pueda llevar de noche.',
  '{"interest_delta": 30, "revealed": ["budget", "nope"], "hidden_objection_raised": "h9", "seller_abusive": false, "end": false, "end_reason": null}',
  'valid', 1500) r;
reset role;
select is((select v ->> 'buyer_seq' from t where k = 'c1'), '3', 'commit inserts the buyer message as seq 3');
select is((select (v ->> 'ended')::boolean from t where k = 'c1'), false, 'the session goes on');
select results_eq(
  $$ select interest_before::int, interest_after::int, interest_delta::int, revealed_keys, hidden_objection_raised,
            meta_status::text, reply_to_seq, seller_abusive, ends_session
       from public.practice_messages where session_id = '00000000-0000-4000-9000-000000000c11' and seq = 3 $$,
  $$ values (45, 60, 15, array['budget'], null::text, 'corrected', 2, false, false) $$,
  'delta clamped, unknown key and objection dropped → corrected');
select results_eq(
  $$ select kind, item_key, value, message_seq from public.practice_session_reveals where session_id = '00000000-0000-4000-9000-000000000c11' $$,
  $$ values ('revealable', 'budget', 'Entre S/ 800 y S/ 1 200', 3) $$, 'reveal value copied from the secrets');
select results_eq(
  $$ select interest::int, last_interest_delta::int, last_seq, turn_lock_seq, provider_wait_ms,
            deadline_at - started_at > interval '21 minutes'
       from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c11' $$,
  $$ values (60, 15, 3, null::int, 1500, true) $$, 'state updated, lease released, wait added to the deadline');
select is(
  (select (v -> 'state') - 'deadlineAt'::text from t where k = 'c1'),
  '{"mood": "interested", "interest": 60, "reveals": [{"key": "budget", "kind": "revealable", "value": "Entre S/ 800 y S/ 1 200", "messageSeq": 3}],
    "lastDelta": 15, "messagesLeft": 19, "hintAvailable": true, "turnInProgress": false, "sellerMessageCount": 1}'::jsonb,
  'public state with the discovered data only');

set local role service_role;
select is((select buyer_seq from public.commit_practice_turn('00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9000-000000000c11', 2, 'Otra respuesta.', '{}', 'valid', 0)), 3, 'commit again → same reply (idempotent)');
select is(pg_temp.err($$ select * from public.commit_practice_turn('00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9000-000000000c11', 99, 'Sin lease.', '{}', 'valid', 0) $$), 'P0010|turn_in_progress', 'commit without the lease → error');
select is(pg_temp.err($$ select * from public.commit_practice_turn('00000000-0000-4000-a000-000000000011',
  '00000000-0000-4000-9000-000000000c11', 2, 'Ajeno.', '{}', 'valid', 0) $$), 'P0002|', 'commit for another user → P0002');
reset role;
select is((select count(*)::int from public.practice_messages where session_id = '00000000-0000-4000-9000-000000000c11'), 3,
  'no duplicate buyer message');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000013');
set local role authenticated;
select results_eq(
  $$ select seller_seq, already_answered, buyer_seq from public.begin_practice_turn(
       '00000000-0000-4000-9000-000000000c11', '00000000-0000-4000-8000-0000000c0001', 'Hola, ¿qué buscas?') $$,
  $$ values (2, true, 3) $$, 'answered client message id → already_answered with the stored reply');

-- Second turn: budget again (dropped), timeline and h1 accepted.
select is((select seller_seq from public.begin_practice_turn('00000000-0000-4000-9000-000000000c11',
  '00000000-0000-4000-8000-0000000c0002', '¿Cuál es tu presupuesto y para cuándo?')), 4, 'second seller message → seq 4');
reset role;
set local role service_role;
select lives_ok($$ select * from public.commit_practice_turn('00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9000-000000000c11', 4, 'Este mes, pero me parece caro.',
  '{"interest_delta": -5, "revealed": ["budget", "timeline"], "hidden_objection_raised": "h1", "seller_abusive": false, "end": false}',
  'valid', 0) $$, 'commit second turn');
reset role;
select results_eq(
  $$ select revealed_keys, hidden_objection_raised, meta_status::text from public.practice_messages
      where session_id = '00000000-0000-4000-9000-000000000c11' and seq = 5 $$,
  $$ values (array['timeline'], 'h1', 'corrected') $$, 'already revealed key dropped; hidden objection raised');
select is((select count(*)::int from public.practice_session_reveals where session_id = '00000000-0000-4000-9000-000000000c11'), 3,
  'budget, timeline and h1 discovered once each');

-- Goal achieved closes the session.
update public.practice_sessions set interest = 78 where id = '00000000-0000-4000-9000-000000000c11';
set local role authenticated;
select is((select seller_seq from public.begin_practice_turn('00000000-0000-4000-9000-000000000c11',
  gen_random_uuid(), '¿Te inscribo en la clase del sábado?')), 6, 'closing question → seq 6');
reset role;
set local role service_role;
select results_eq(
  $$ select buyer_seq, ended, end_reason::text, evaluation_status::text from public.commit_practice_turn(
       '00000000-0000-4000-a000-000000000013', '00000000-0000-4000-9000-000000000c11', 6, 'Sí, inscríbeme.',
       '{"interest_delta": 6, "end": true, "end_reason": "goal_achieved"}', 'valid', 0) $$,
  $$ values (7, true, 'goal_achieved', 'pending') $$, 'goal achieved with interest ≥ 80 finalizes the session');
reset role;
select results_eq(
  $$ select status::text, end_reason::text, evaluation_status::text, evaluation_due_at > now() + interval '2 minutes', ended_at is not null
       from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c11' $$,
  $$ values ('finalized', 'goal_achieved', 'pending', true, true) $$, 'finalized, pending evaluation due in 3 minutes');
select is((select ends_session from public.practice_messages where session_id = '00000000-0000-4000-9000-000000000c11' and seq = 7),
  true, 'the closing message is marked');
set local role authenticated;
select is(pg_temp.err($$ select * from public.begin_practice_turn('00000000-0000-4000-9000-000000000c11', gen_random_uuid(), 'Hola') $$),
  'P0010|not_active', 'a finalized session takes no more messages');
reset role;

-- ------------------------------------------------------------------------------ session S2: release, quota, limit
select pg_temp.active('00000000-0000-4000-9000-000000000c12', 50);
set local role authenticated;
select is((select seller_seq from public.begin_practice_turn('00000000-0000-4000-9000-000000000c12', gen_random_uuid(), 'Hola')), 2,
  'S2 first seller message');
reset role;
set local role service_role;
select lives_ok($$ select public.release_practice_turn('00000000-0000-4000-a000-000000000013', '00000000-0000-4000-9000-000000000c12', 2, 2000) $$,
  'release after a failed turn');
reset role;
select results_eq(
  $$ select turn_lock_seq, provider_wait_ms, deadline_at - started_at > interval '21 minutes' from public.practice_sessions
      where id = '00000000-0000-4000-9000-000000000c12' $$,
  $$ values (null::int, 2000, true) $$, 'lease released and the wait added to provider_wait_ms and the deadline');
select is((select count(*)::int from public.practice_messages where session_id = '00000000-0000-4000-9000-000000000c12' and author = 'buyer' and seq > 1),
  0, 'the seller message stays unanswered');

-- Quota reduced to 0 during the session: the session goes on (edge case "Cuota reducida").
update public.quotas set daily_limit = 0, monthly_limit = 0 where organization_id = '00000000-0000-4000-b000-00000000000c';
set local role authenticated;
select is((select seller_seq from public.begin_practice_turn('00000000-0000-4000-9000-000000000c12', gen_random_uuid(), 'Sigo aquí')), 3,
  'begin works with the quota at 0');
reset role;
set local role service_role;
select lives_ok($$ select * from public.commit_practice_turn('00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9000-000000000c12', 3, 'Cuéntame más.', '{"interest_delta": 2}', 'valid', 0) $$, 'commit works with the quota at 0');
reset role;
update public.quotas set daily_limit = 10, monthly_limit = 100 where organization_id = '00000000-0000-4000-b000-00000000000c';

-- 20 seller messages: no 21st; the 20th closes with message_limit.
update public.practice_sessions set seller_message_count = 20 where id = '00000000-0000-4000-9000-000000000c12';
set local role authenticated;
select is(pg_temp.err($$ select * from public.begin_practice_turn('00000000-0000-4000-9000-000000000c12', gen_random_uuid(), 'Uno más') $$),
  'P0010|message_limit', '21st seller message → message_limit');
reset role;
update public.practice_sessions set seller_message_count = 19 where id = '00000000-0000-4000-9000-000000000c12';
set local role authenticated;
select is((select seller_seq from public.begin_practice_turn('00000000-0000-4000-9000-000000000c12', gen_random_uuid(), 'El último')), 5,
  '20th seller message');
reset role;
set local role service_role;
select results_eq(
  $$ select ended, end_reason::text from public.commit_practice_turn('00000000-0000-4000-a000-000000000013',
       '00000000-0000-4000-9000-000000000c12', 5, 'Lo pensaré, gracias.', '{"interest_delta": 0}', 'valid', 0) $$,
  $$ values (true, 'message_limit') $$, 'the reply to the 20th message closes with message_limit');
reset role;

-- ------------------------------------------------------------------------------ S3: deadline passed
select pg_temp.active('00000000-0000-4000-9000-000000000c13', 50, true, '-1 second');
update public.practice_sessions set seller_message_count = 1 where id = '00000000-0000-4000-9000-000000000c13';
set local role authenticated;
select results_eq(
  $$ select seller_seq, closed from public.begin_practice_turn('00000000-0000-4000-9000-000000000c13', gen_random_uuid(), 'Tarde') $$,
  $$ values (null::int, true) $$, 'deadline passed → the session is closed and no message is stored');
reset role;
select results_eq(
  $$ select status::text, end_reason::text, evaluation_status::text from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c13' $$,
  $$ values ('finalized', 'time_limit', 'pending') $$, 'closed by time_limit with a pending evaluation');
select is((select count(*)::int from public.practice_messages where session_id = '00000000-0000-4000-9000-000000000c13'), 1, 'only m1');

-- ------------------------------------------------------------------------------ S4: hints and finish
select pg_temp.active('00000000-0000-4000-9000-000000000c14', 50);
set local role authenticated;
select is(pg_temp.err($$ select * from public.finish_practice_session('00000000-0000-4000-9000-000000000c14') $$),
  'P0010|no_seller_messages', 'finish without seller messages → no_seller_messages');
select is((select hints_used from public.request_practice_hint('00000000-0000-4000-9000-000000000c14')), 1, 'first hint of the turn');
select is(pg_temp.err($$ select * from public.request_practice_hint('00000000-0000-4000-9000-000000000c14') $$),
  'P0010|hint_already_used', 'one hint per turn');
select is((select seller_seq from public.begin_practice_turn('00000000-0000-4000-9000-000000000c14', gen_random_uuid(), 'Hola')), 2, 'S4 seller message');
select is(pg_temp.err($$ select * from public.finish_practice_session('00000000-0000-4000-9000-000000000c14') $$),
  'P0010|turn_in_progress', 'finish while the buyer answers → turn_in_progress');
select is((select hints_used from public.request_practice_hint('00000000-0000-4000-9000-000000000c14')), 2, 'a new turn allows a new hint');
reset role;
set local role service_role;
select lives_ok($$ select * from public.commit_practice_turn('00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9000-000000000c14', 2, 'Hola, cuéntame.', '{"interest_delta": 1}', 'valid', 0) $$, 'S4 commit');
reset role;
set local role authenticated;
select is((select evaluation_status::text from public.finish_practice_session('00000000-0000-4000-9000-000000000c14')), 'pending',
  'finish → pending');
select is((select evaluation_status::text from public.finish_practice_session('00000000-0000-4000-9000-000000000c14')), 'pending',
  'finish again → same state (idempotent)');
reset role;
select results_eq(
  $$ select status::text, end_reason::text from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c14' $$,
  $$ values ('finalized', 'seller_ended') $$, 'finalized by the seller');

-- ------------------------------------------------------------------------------ S5: hints disabled, context
select pg_temp.active('00000000-0000-4000-9000-000000000c15', 50, false);
set local role authenticated;
select is(pg_temp.err($$ select * from public.request_practice_hint('00000000-0000-4000-9000-000000000c15') $$),
  'P0010|hints_disabled', 'hints disabled → error');
reset role;
set local role service_role;
select is(
  (select ctx #>> '{buyer,motivation}' from (select public.get_practice_turn_context('00000000-0000-4000-a000-000000000013',
     '00000000-0000-4000-9000-000000000c15') as ctx) x),
  'Quiere un ascenso este año.', 'service_role reads the full scenario');
select is(
  (select jsonb_array_length(ctx -> 'messages') from (select public.get_practice_turn_context('00000000-0000-4000-a000-000000000013',
     '00000000-0000-4000-9000-000000000c15') as ctx) x),
  1, 'with the transcript');
select is(pg_temp.err($$ select public.get_practice_turn_context('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-9000-000000000c15') $$),
  'P0002|', 'context for another user → P0002');
reset role;

-- Suspended organization: turns are refused (42501).
update public.organizations set status = 'suspended', suspended_reason = 'x', suspended_at = now(),
  suspended_by = '00000000-0000-4000-a000-000000000001' where id = '00000000-0000-4000-b000-00000000000c';
set local role authenticated;
select is(pg_temp.err($$ select * from public.begin_practice_turn('00000000-0000-4000-9000-000000000c15', gen_random_uuid(), 'Hola') $$),
  '42501|', 'suspended organization → 42501');
reset role;

select * from finish();
rollback;
