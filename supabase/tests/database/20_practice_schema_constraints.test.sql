-- T020 — 002 schema constraints: CHECKs of T010–T014, partial unique indexes and immutability
-- (also for service_role). Uses the seed of seller A (supabase/seed.sql → "002 · Seller practice").
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- Seller A seed ids.
create function pg_temp.id(p_group text, p_suffix text) returns uuid
language sql immutable as $$ select format('00000000-0000-4000-%s-000000000a%s', p_group, p_suffix)::uuid $$;

create function pg_temp.ins_session(p_status text, p_user uuid default '00000000-0000-4000-a000-000000000011')
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
  v_active boolean := p_status = 'active';
begin
  insert into public.practice_sessions (
    id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
    selected_objection_ids, visible_objection, interest, setup_idempotency_key, configured_expires_at,
    started_at, deadline_at, buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model
  ) values (
    v_id, '00000000-0000-4000-b000-00000000000a', p_user, pg_temp.id('9100', '01'), pg_temp.id('9200', '12'), 2,
    p_status::public.practice_status, 3, array[pg_temp.id('9300', '11')], 'Me queda muy lejos de Lima.', 45,
    gen_random_uuid(), now() + interval '1 day',
    case when v_active then now() end, case when v_active then now() + interval '20 minutes' end,
    'buyer-setup@1.0.0', 'buyer@1.0.0', 'm', 'm'
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- products, versions, objections
select throws_ok($$ update public.products set current_name = 'X' where id = pg_temp.id('9100', '01') $$,
  '23514', null, 'product name shorter than 2 characters is rejected');
select throws_ok($$ update public.products set status = 'archived' where id = pg_temp.id('9100', '01') $$,
  '23514', null, 'archived product requires archived_at');
select throws_ok($$ update public.products set archived_at = now() where id = pg_temp.id('9100', '01') $$,
  '23514', null, 'archived_at requires the archived status');

create function pg_temp.ins_version(p_version int, p_kind text, p_min numeric, p_max numeric, p_benefits text[],
  p_org uuid default '00000000-0000-4000-b000-00000000000a')
returns void
language sql
as $$
  insert into public.product_versions (organization_id, product_id, version, sector, name, description, price_kind,
    price_min, price_max, benefits, differentiators, verifiable_facts, created_by)
  values (p_org, pg_temp.id('9100', '01'), p_version, 'real_estate', 'Lote prueba', 'Descripción', p_kind::public.price_kind,
    p_min, p_max, p_benefits, '{}', '{}', '00000000-0000-4000-a000-000000000011');
$$;

select throws_ok($$ select pg_temp.ins_version(10, 'range', 100, 50, array['Beneficio']) $$,
  '23514', null, 'price_max lower than price_min is rejected');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 120, array['Beneficio']) $$,
  '23514', null, 'fixed price requires price_max = price_min');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, '{}') $$,
  '23514', null, 'at least one benefit is required');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, array['Beneficio', '   ']) $$,
  '23514', null, 'blank benefit is rejected');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, array_fill('Beneficio'::text, array[11])) $$,
  '23514', null, 'more than 10 benefits are rejected');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, array[repeat('x', 201)]) $$,
  '23514', null, 'benefit longer than 200 characters is rejected');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, array[['a', 'b'], ['c', 'd']]) $$,
  '23514', null, 'multidimensional arrays are rejected');
select throws_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, array['Beneficio'], '00000000-0000-4000-b000-00000000000b') $$,
  '23514', null, 'version organization must match the product organization');
select throws_ok($$ select pg_temp.ins_version(1, 'fixed', 100, 100, array['Beneficio']) $$,
  '23505', null, 'version numbers are unique per product');
select lives_ok($$ select pg_temp.ins_version(10, 'fixed', 100, 100, array['Beneficio']) $$,
  'a valid fixed-price version is accepted');
select throws_ok($$ insert into public.objections (organization_id, product_id, text) values ('00000000-0000-4000-b000-00000000000a', pg_temp.id('9100', '01'), 'Caro') $$,
  '23514', null, 'objection shorter than 5 characters is rejected');

-- ---------------------------------------------------------------- practice_sessions coherence
select throws_ok($$ update public.practice_sessions set evaluation_status = 'pending', evaluation_due_at = now() where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'evaluated session has no evaluation_status');
select throws_ok($$ update public.practice_sessions set evaluation_status = null where id = pg_temp.id('9000', '02') $$,
  '23514', null, 'finalized session requires evaluation_status');
select throws_ok($$ update public.practice_sessions set end_reason = null where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'ended session requires end_reason');
select throws_ok($$ update public.practice_sessions set started_at = null, deadline_at = null where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'evaluated session requires started_at');
select throws_ok($$ update public.practice_sessions set evaluation_status = 'pending' where id = pg_temp.id('9000', '02') $$,
  '23514', null, 'pending evaluation requires evaluation_due_at');
select throws_ok($$ update public.practice_sessions set difficulty = 6 where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'difficulty outside 1–5 is rejected');
select throws_ok($$ update public.practice_sessions set selected_objection_ids = array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'more than 3 selected objections are rejected');
select throws_ok($$ update public.practice_sessions set last_interest_delta = 16 where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'interest delta outside ±15 is rejected');
select throws_ok($$ update public.practice_sessions set seller_message_count = 21 where id = pg_temp.id('9000', '01') $$,
  '23514', null, 'more than 20 seller messages are rejected');

select lives_ok($$ select pg_temp.ins_session('active') $$, 'one active session per user is accepted');
select throws_ok($$ select pg_temp.ins_session('active') $$, '23505', null, 'a second active session of the same user is rejected');
select lives_ok($$ select pg_temp.ins_session('configured') $$, 'one configured session per user is accepted');
select throws_ok($$ select pg_temp.ins_session('configured') $$, '23505', null, 'a second configured session of the same user is rejected');

-- ---------------------------------------------------------------- practice_messages
create function pg_temp.ins_message(p_seq int, p_author text, p_content text, p_client uuid,
  p_user uuid default '00000000-0000-4000-a000-000000000011')
returns void
language sql
as $$
  insert into public.practice_messages (organization_id, user_id, session_id, seq, author, content, client_message_id,
    interest_after, meta_status)
  values ('00000000-0000-4000-b000-00000000000a', p_user, pg_temp.id('9000', '03'), p_seq, p_author::public.message_author,
    p_content, p_client,
    case when p_author = 'buyer' then 40 end, case when p_author = 'buyer' then 'valid'::public.turn_meta_status end);
$$;

select throws_ok($$ select pg_temp.ins_message(1, 'seller', 'Hola', gen_random_uuid()) $$,
  '23514', null, 'the first message is always the buyer');
select throws_ok($$ select pg_temp.ins_message(50, 'seller', 'Hola', null) $$,
  '23514', null, 'seller messages require client_message_id');
select throws_ok($$ select pg_temp.ins_message(50, 'seller', repeat('a', 1001), gen_random_uuid()) $$,
  '23514', null, 'seller messages longer than 1000 characters are rejected');
select throws_ok($$ select pg_temp.ins_message(50, 'seller', '   ', gen_random_uuid()) $$,
  '23514', null, 'blank seller messages are rejected');
select throws_ok($$ select pg_temp.ins_message(50, 'buyer', repeat('a', 701), null) $$,
  '23514', null, 'buyer messages longer than 700 characters are rejected');
select throws_ok($$ select pg_temp.ins_message(50, 'seller', 'Hola', gen_random_uuid(), '00000000-0000-4000-a000-000000000012') $$,
  '23514', null, 'message owner must match the session owner');
select throws_ok($$ insert into public.practice_session_reveals (organization_id, user_id, session_id, kind, item_key, value, message_seq) values ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', pg_temp.id('9000', '01'), 'revealable', 'budget', 'otra vez', 5) $$,
  '23505', null, 'each revealable is recorded once per session');

-- ---------------------------------------------------------------- evaluation
select throws_ok($$ insert into public.practice_evaluation_criteria (organization_id, user_id, evaluation_id, criterion_id, status, score, max_score, evidence_seqs, justification, improvement, confidence) select '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', pg_temp.id('9400', '04'), id, 'evaluated', 5, 99, '{2}', 'x', 'y', 0.5 from public.rubric_criteria where key = 'diagnosis' $$,
  '23514', null, 'criterion max_score must equal the rubric weight');

-- ---------------------------------------------------------------- immutability (service_role too)
set local role service_role;
select throws_ok($$ update public.product_versions set name = 'Otro' where id = pg_temp.id('9200', '12') $$, '42501', 'product_versions rows are immutable', 'product_versions cannot be updated');
select throws_ok($$ delete from public.product_versions where id = pg_temp.id('9200', '11') $$, '42501', 'product_versions rows are immutable', 'product_versions cannot be deleted');
select throws_ok($$ update public.rubrics set name = 'Otra' $$, '42501', 'rubrics rows are immutable', 'rubrics cannot be updated');
select throws_ok($$ delete from public.rubric_criteria $$, '42501', 'rubric_criteria rows are immutable', 'rubric_criteria cannot be deleted');
select throws_ok($$ update public.practice_messages set content = 'editado' where session_id = pg_temp.id('9000', '01') $$, '42501', 'practice_messages rows are immutable', 'practice_messages cannot be updated');
select throws_ok($$ delete from public.practice_messages where session_id = pg_temp.id('9000', '01') $$, '42501', 'practice_messages rows are immutable', 'practice_messages cannot be deleted');
select throws_ok($$ update public.practice_evaluations set total_score = 100, level = 'advanced' where id = pg_temp.id('9400', '01') $$, '42501', 'practice_evaluations rows are immutable', 'practice_evaluations cannot be updated');
select throws_ok($$ delete from public.practice_evaluations where id = pg_temp.id('9400', '01') $$, '42501', 'practice_evaluations rows are immutable', 'practice_evaluations cannot be deleted');
select throws_ok($$ update public.practice_evaluation_criteria set score = 0 where evaluation_id = pg_temp.id('9400', '01') $$, '42501', 'practice_evaluation_criteria rows are immutable', 'practice_evaluation_criteria cannot be updated');
select throws_ok($$ delete from public.practice_ethical_flags where evaluation_id = pg_temp.id('9400', '01') $$, '42501', 'practice_ethical_flags rows are immutable', 'practice_ethical_flags cannot be deleted');
select throws_ok($$ delete from public.simulation_consumptions where session_id = pg_temp.id('9000', '01') $$, '42501', 'simulation_consumptions rows are immutable', 'simulation_consumptions cannot be deleted');
reset role;

select * from finish();
rollback;
