-- T021 — 002 A/B isolation (AC-01, FR-054, FR-055, FR-056): seller A never sees B's practice data,
-- nobody writes the new tables directly, suspended organizations/memberships see nothing, the hidden
-- persona appears only after the session ends and the superadmin sees no content.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.auth_as(p_user uuid, p_aal text default 'aal1')
returns void
language plpgsql
as $$
declare
  v_sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (v_sid, p_user, now() - interval '1 minute', now(), p_aal::auth.aal_level);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', v_sid, 'aal', p_aal)::text,
    true
  );
end;
$$;

-- true only when the statement fails for lack of privileges (42501).
create function pg_temp.write_denied(p_sql text)
returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception
  when insufficient_privilege then return true;
  when others then return false;
end;
$$;

create function pg_temp.content_tables()
returns setof text
language sql
immutable
as $$
  select unnest(array[
    'products', 'product_versions', 'objections', 'practice_sessions', 'practice_buyer_profiles',
    'practice_session_secrets', 'practice_session_reveals', 'practice_messages', 'practice_evaluations',
    'practice_evaluation_criteria', 'practice_ethical_flags', 'simulation_consumptions'
  ]);
$$;

-- Rows of the suspended organization D and of the suspended membership E (seller E, org E).
insert into public.products (id, organization_id, created_by, current_name)
values
  ('00000000-0000-4000-9100-0000000000d1', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-a000-000000000014', 'Producto D'),
  ('00000000-0000-4000-9100-0000000000e1', '00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-a000-000000000015', 'Producto E');

-- An active session of A with its hidden persona (must stay invisible while active).
insert into public.practice_sessions (
  id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
  selected_objection_ids, visible_objection, interest, setup_idempotency_key, configured_expires_at,
  started_at, deadline_at, buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model
) values (
  '00000000-0000-4000-9000-000000000a99', '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011',
  '00000000-0000-4000-9100-000000000a01', '00000000-0000-4000-9200-000000000a12', 2, 'active', 3,
  array['00000000-0000-4000-9300-000000000a11'::uuid], 'Me queda muy lejos de Lima.', 45, gen_random_uuid(),
  now() + interval '1 day', now(), now() + interval '20 minutes', 'buyer-setup@1.0.0', 'buyer@1.0.0', 'm', 'm'
);
insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables, hidden_objections, opening_message)
values (
  '00000000-0000-4000-9000-000000000a99', '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011',
  'Motivación secreta de prueba.', 'Personalidad secreta de prueba.',
  '[{"key": "budget", "value": "S/ 1"}]', '[{"id": "h1", "text": "Objeción oculta"}]', 'Hola.'
);
insert into public.practice_setup_attempts (organization_id, user_id, outcome)
values ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'success');

-- ---------------------------------------------------------------- seller A (org A active)
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;

select is((select count(*)::int from public.products where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no product of B');
select is((select count(*)::int from public.product_versions where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no product version of B');
select is((select count(*)::int from public.objections where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no objection of B');
select is((select count(*)::int from public.practice_sessions where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no session of B');
select is((select count(*)::int from public.practice_buyer_profiles where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no buyer profile of B');
select is((select count(*)::int from public.practice_session_secrets where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no hidden persona of B');
select is((select count(*)::int from public.practice_session_reveals where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no reveal of B');
select is((select count(*)::int from public.practice_messages where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no message of B');
select is((select count(*)::int from public.practice_evaluations where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no evaluation of B');
select is((select count(*)::int from public.practice_evaluation_criteria where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no criterion score of B');
select is((select count(*)::int from public.practice_ethical_flags where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no ethical flag of B');
select is((select count(*)::int from public.simulation_consumptions where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no consumption of B');

select is((select count(*)::int from public.products), 3, 'A sees its own products');
select is((select count(*)::int from public.rubric_criteria), 7, 'A reads the platform rubric');

select is(
  (select count(*)::int from public.practice_session_secrets where session_id = '00000000-0000-4000-9000-000000000a99'),
  0, 'the hidden persona of an active session stays invisible to its owner'
);
select is((select count(*)::int from public.practice_session_secrets), 4, 'hidden personas of ended sessions are visible to their owner');

select throws_ok($$ select count(*) from public.practice_setup_attempts $$, '42501', null, 'practice_setup_attempts is not readable by authenticated');

select is_empty(
  $$
    select t from (select pg_temp.content_tables() as t union all values ('rubrics'), ('rubric_criteria'), ('practice_setup_attempts')) x
     where not (
       pg_temp.write_denied(format('insert into public.%I default values', t))
       and pg_temp.write_denied(format(
         'update public.%1$I set %2$I = %2$I',
         t, (select attname from pg_attribute where attrelid = format('public.%I', t)::regclass and attnum > 0 and attidentity = '' and not attisdropped order by attnum limit 1)))
       and pg_temp.write_denied(format('delete from public.%I', t))
     )
  $$,
  'authenticated cannot INSERT, UPDATE or DELETE any 002 table directly (own rows included)'
);

-- ---------------------------------------------------------------- seller D (org D suspended)
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000014');
set local role authenticated;
select is((select count(*)::int from public.products), 0, 'a suspended organization sees none of its products');

-- ---------------------------------------------------------------- seller E (membership suspended)
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000015');
set local role authenticated;
select is((select count(*)::int from public.products), 0, 'a suspended membership sees none of its organization products');

-- ---------------------------------------------------------------- superadmin aal2 (FR-056)
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;
select is(
  (select count(*)::int from public.products) + (select count(*)::int from public.practice_sessions)
    + (select count(*)::int from public.practice_messages) + (select count(*)::int from public.practice_session_secrets)
    + (select count(*)::int from public.practice_evaluations) + (select count(*)::int from public.practice_evaluation_criteria),
  0, 'the superadmin sees no practice content'
);

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select is_empty(
  $$ select t from pg_temp.content_tables() t where not pg_temp.write_denied(format('select 1 from public.%I limit 1', t)) $$,
  'anon cannot read any 002 content table'
);
reset role;

select * from finish();
rollback;
