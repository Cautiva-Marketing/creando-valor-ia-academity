-- T056 — objection functions (contracts/database-rpc.md): create_objection (5–300, optional category,
-- max 20 per product with FOR UPDATE on the product → P0010 objection_limit), update_objection,
-- delete_objection (audit objection.deleted { product_id }), other org → P0002, 42501 cases, and
-- FR-008: sessions keep their copy of the objection texts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

-- A product in organization D (suspended) for the 42501 case.
insert into public.products (id, organization_id, created_by, current_name)
values ('00000000-0000-4000-9100-000000000d01', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-a000-000000000014', 'Producto D');

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- Snapshot of what the seeded session a02 copied (visible a12 + hidden a13).
create temp table before_session as
select s.visible_objection, sec.hidden_objections
  from public.practice_sessions s
  join public.practice_session_secrets sec on sec.session_id = s.id
 where s.id = '00000000-0000-4000-9000-000000000a02';
grant select on before_session to authenticated;

-- ------------------------------------------------------------------------------ grants
select ok(not has_function_privilege('anon', 'public.create_objection(uuid, text, public.objection_category)', 'execute'), 'anon cannot create objections');
select ok(has_function_privilege('authenticated', 'public.delete_objection(uuid)', 'execute'), 'authenticated can delete objections');
select ok(
  pg_get_functiondef('public.create_objection(uuid, text, public.objection_category)'::regprocedure) ~* 'for update',
  'create_objection locks the product (FOR UPDATE) before counting'
);

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;

-- ------------------------------------------------------------------------------ create
insert into t select 'o1', public.create_objection('00000000-0000-4000-9100-000000000a02', '  Lo voy a pensar con calma.  ', 'time')::text;
select results_eq(
  $$ select text, category::text, organization_id::text from public.objections where id = (select v::uuid from t where k = 'o1') $$,
  $$ values ('Lo voy a pensar con calma.', 'time', '00000000-0000-4000-b000-00000000000a') $$,
  'create trims the text and keeps the category and organization'
);
insert into t select 'o2', public.create_objection('00000000-0000-4000-9100-000000000a02', 'No tengo tiempo ahora.', null)::text;
select is((select category::text from public.objections where id = (select v::uuid from t where k = 'o2')), null, 'category is optional');

select throws_ok($$ select public.create_objection('00000000-0000-4000-9100-000000000a02', 'Caro', null) $$,
  '23514', null, 'text shorter than 5 → 23514');
select throws_ok($$ select public.create_objection('00000000-0000-4000-9100-000000000a02', '      ', null) $$,
  '23514', null, 'blank text → 23514');
select throws_ok($$ select public.create_objection('00000000-0000-4000-9100-000000000a02', repeat('x', 301), null) $$,
  '23514', null, 'text longer than 300 → 23514');
select throws_ok($$ select public.create_objection('00000000-0000-4000-9100-000000000b01', 'Objeción ajena.', null) $$,
  'P0002', null, 'product of another organization → P0002');
select throws_ok($$ select public.create_objection(gen_random_uuid(), 'Objeción sin producto.', null) $$,
  'P0002', null, 'unknown product → P0002');

-- Up to 20 per product (a02 has 2 seeded + 2 created): 16 more fit, the 21st fails.
select lives_ok(
  $$ select public.create_objection('00000000-0000-4000-9100-000000000a02', 'Objeción número ' || n, 'price') from generate_series(5, 20) n $$,
  'objections 5 to 20 are accepted'
);
select is((select count(*)::int from public.objections where product_id = '00000000-0000-4000-9100-000000000a02'), 20, 'the product has 20 objections');
select throws_ok($$ select public.create_objection('00000000-0000-4000-9100-000000000a02', 'Objeción número 21', null) $$,
  'P0010', 'objection_limit', 'the 21st → P0010 objection_limit');

-- Archived product: objections can still be edited and created (contracts/server-actions.md).
reset role;
update public.products set status = 'archived', archived_at = now() where id = '00000000-0000-4000-9100-000000000a01';
set local role authenticated;
select lives_ok($$ select public.update_objection('00000000-0000-4000-9300-000000000a11', 'Me queda lejos de la ciudad.', 'logistics') $$,
  'archived product: objections can be edited');

-- ------------------------------------------------------------------------------ update
select lives_ok($$ select public.update_objection('00000000-0000-4000-9300-000000000a12', '  Está caro comparado con otros lotes.  ', null) $$,
  'update text and clear the category');
select results_eq(
  $$ select text, category::text from public.objections where id = '00000000-0000-4000-9300-000000000a12' $$,
  $$ values ('Está caro comparado con otros lotes.', null::text) $$,
  'update stores the trimmed text and the new category'
);
select throws_ok($$ select public.update_objection('00000000-0000-4000-9300-000000000a12', 'abc', null) $$,
  '23514', null, 'invalid text on update → 23514');
select throws_ok($$ select public.update_objection('00000000-0000-4000-9300-000000000b11', 'Objeción ajena editada.', null) $$,
  'P0002', null, 'update an objection of another organization → P0002');

-- ------------------------------------------------------------------------------ delete
select lives_ok($$ select public.delete_objection('00000000-0000-4000-9300-000000000a13') $$, 'delete');
select is((select count(*)::int from public.objections where id = '00000000-0000-4000-9300-000000000a13'), 0, 'the objection is gone');
select throws_ok($$ select public.delete_objection('00000000-0000-4000-9300-000000000a13') $$,
  'P0002', null, 'deleting it again → P0002');
select throws_ok($$ select public.delete_objection('00000000-0000-4000-9300-000000000b11') $$,
  'P0002', null, 'delete an objection of another organization → P0002');

-- FR-008: the seeded session keeps the copied texts.
select results_eq(
  $$ select s.visible_objection, sec.hidden_objections
       from public.practice_sessions s
       join public.practice_session_secrets sec on sec.session_id = s.id
      where s.id = '00000000-0000-4000-9000-000000000a02' $$,
  $$ select visible_objection, hidden_objections from before_session $$,
  'editing/deleting objections does not change the session copies'
);

reset role;
select results_eq(
  $$ select action, actor_user_id::text, organization_id::text, object_type, object_id, data
       from public.audit_logs where action = 'objection.deleted' and object_id = '00000000-0000-4000-9300-000000000a13' $$,
  $$ values ('objection.deleted', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-b000-00000000000a',
             'objection', '00000000-0000-4000-9300-000000000a13',
             '{"product_id": "00000000-0000-4000-9100-000000000a01"}'::jsonb) $$,
  'delete is audited with ids only'
);

-- ------------------------------------------------------------------------------ 42501
select pg_temp.auth_as('00000000-0000-4000-a000-000000000014');
set local role authenticated;
select throws_ok($$ select public.create_objection('00000000-0000-4000-9100-000000000d01', 'Objeción en org suspendida.', null) $$,
  '42501', null, 'suspended organization → 42501');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-000000000011',
  'role', 'authenticated', 'session_id', gen_random_uuid(), 'aal', 'aal1')::text, true);
set local role authenticated;
select throws_ok($$ select public.delete_objection('00000000-0000-4000-9300-000000000a21') $$,
  '42501', null, 'invalid session → 42501');
reset role;

select * from finish();
rollback;
