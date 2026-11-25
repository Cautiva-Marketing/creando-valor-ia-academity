-- T041 — product functions (contracts/database-rpc.md → "Productos y objeciones"): create_product,
-- update_product, set_product_status; payload validation (23514), idempotency, immutable versions,
-- optimistic version check (P0010), audit with ids only, other org → P0002, invalid session /
-- suspended org / suspended membership → 42501.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

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
grant execute on function pg_temp.auth_as(uuid, text) to authenticated;

create function pg_temp.payload(p_patch jsonb default '{}')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'sector', 'real_estate',
    'name', '  Lote Las Palmeras  ',
    'description', 'Lotes de 120 m² a 10 minutos de la Panamericana Sur.',
    'price_kind', 'range',
    'price_min', 45000,
    'price_max', 60000.5,
    'benefits', jsonb_build_array('Saneamiento completo', ' Cerca de la playa '),
    'differentiators', jsonb_build_array('Financiamiento directo'),
    'verifiable_facts', '[]'::jsonb
  ) || p_patch;
$$;
grant execute on function pg_temp.payload(jsonb) to authenticated;

-- Results kept across role switches.
create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- ------------------------------------------------------------------------------ grants
select ok(not has_function_privilege('anon', 'public.create_product(uuid, jsonb, uuid)', 'execute'), 'anon cannot create products');
select ok(has_function_privilege('authenticated', 'public.update_product(uuid, integer, jsonb)', 'execute'), 'authenticated can update products');
select ok(not has_function_privilege('anon', 'public.set_product_status(uuid, public.product_status)', 'execute'), 'anon cannot change product status');

-- ------------------------------------------------------------------------------ create
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;

insert into t select 'p1', product_id::text from public.create_product(
  '00000000-0000-4000-b000-00000000000a', pg_temp.payload(), '00000000-0000-4000-8000-00000000c001');
select isnt((select v from t where k = 'p1'), null, 'create_product returns the new product id');

select results_eq(
  $$ select product_id::text, duplicate from public.create_product(
       '00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"name": "Otro nombre"}'),
       '00000000-0000-4000-8000-00000000c001') $$,
  $$ select v, true from t where k = 'p1' $$,
  'same idempotency key → same product, duplicate = true (payload ignored)'
);

select results_eq(
  $$ select status::text, current_version, current_name, archived_at is null from public.products where id = (select v::uuid from t where k = 'p1') $$,
  $$ values ('active', 1, 'Lote Las Palmeras', true) $$,
  'product is active, version 1, trimmed current_name'
);

select results_eq(
  $$ select version, name, price_min, price_max, benefits, differentiators, verifiable_facts
       from public.product_versions where product_id = (select v::uuid from t where k = 'p1') $$,
  $$ values (1, 'Lote Las Palmeras', 45000.00::numeric, 60000.50::numeric,
             array['Saneamiento completo', 'Cerca de la playa'], array['Financiamiento directo'], '{}'::text[]) $$,
  'version 1 stores the trimmed payload'
);

insert into t select 'p2', product_id::text from public.create_product('00000000-0000-4000-b000-00000000000a',
  pg_temp.payload('{"price_kind": "fixed", "price_min": 1250.5, "price_max": null}'), '00000000-0000-4000-8000-00000000c002');
select results_eq(
  $$ select price_kind::text, price_min, price_max from public.product_versions where product_id = (select v::uuid from t where k = 'p2') $$,
  $$ values ('fixed', 1250.50::numeric, 1250.50::numeric) $$,
  'fixed price: price_max takes price_min'
);

-- Invalid payloads (same rules as productSchema).
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"name": "   "}'), gen_random_uuid()) $$,
  '23514', null, 'blank name → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"price_min": -1}'), gen_random_uuid()) $$,
  '23514', null, 'negative price → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"price_min": 70000}'), gen_random_uuid()) $$,
  '23514', null, 'range with min > max → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"price_max": null}'), gen_random_uuid()) $$,
  '23514', null, 'range without max → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"price_min": 10.555}'), gen_random_uuid()) $$,
  '23514', null, 'more than 2 decimals → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"benefits": []}'), gen_random_uuid()) $$,
  '23514', null, '0 benefits → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a',
    pg_temp.payload(jsonb_build_object('benefits', to_jsonb(array_fill('Beneficio'::text, array[11])))), gen_random_uuid()) $$,
  '23514', null, '11 benefits → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a',
    pg_temp.payload(jsonb_build_object('differentiators', jsonb_build_array(repeat('x', 201)))), gen_random_uuid()) $$,
  '23514', null, 'element > 200 characters → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a',
    pg_temp.payload(jsonb_build_object('description', repeat('x', 1001))), gen_random_uuid()) $$,
  '23514', null, 'description > 1000 → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"sector": "spaceships"}'), gen_random_uuid()) $$,
  '23514', null, 'unknown sector → 23514');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload('{"benefits": "texto"}'), gen_random_uuid()) $$,
  '23514', null, 'benefits not an array → 23514');

-- Other organization: P0002 (no disclosure).
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000b', pg_temp.payload(), gen_random_uuid()) $$,
  'P0002', null, 'create in another organization → P0002');

-- ------------------------------------------------------------------------------ update
select results_eq(
  $$ select version, unchanged from public.update_product((select v::uuid from t where k = 'p1'), 1,
       pg_temp.payload('{"name": "Lote Las Palmeras II", "price_max": 65000}')) $$,
  $$ values (2, false) $$,
  'update creates version 2'
);
select results_eq(
  $$ select current_version, current_name from public.products where id = (select v::uuid from t where k = 'p1') $$,
  $$ values (2, 'Lote Las Palmeras II') $$,
  'current_version and current_name follow the new version'
);
select is(
  (select array_agg(name order by version) from public.product_versions where product_id = (select v::uuid from t where k = 'p1')),
  array['Lote Las Palmeras', 'Lote Las Palmeras II'],
  'version 1 is preserved unchanged'
);
select throws_ok($$ select public.update_product((select v::uuid from t where k = 'p1'), 1, pg_temp.payload()) $$,
  'P0010', 'version_mismatch', 'stale expected version → P0010 version_mismatch');
select results_eq(
  $$ select version, unchanged from public.update_product((select v::uuid from t where k = 'p1'), 2,
       pg_temp.payload('{"name": "Lote Las Palmeras II ", "price_max": 65000.00}')) $$,
  $$ values (2, true) $$,
  'identical content (after trim) → unchanged, no new version'
);
select is((select count(*)::int from public.product_versions where product_id = (select v::uuid from t where k = 'p1')), 2,
  'unchanged update does not add a version');
select throws_ok($$ select public.update_product((select v::uuid from t where k = 'p1'), 2, pg_temp.payload('{"benefits": []}')) $$,
  '23514', null, 'invalid update payload → 23514');
select throws_ok($$ select public.update_product('00000000-0000-4000-9100-000000000b01', 1, pg_temp.payload()) $$,
  'P0002', null, 'update a product of another organization → P0002');

-- ------------------------------------------------------------------------------ status
select lives_ok($$ select public.set_product_status((select v::uuid from t where k = 'p1'), 'archived') $$, 'archive');
select lives_ok($$ select public.set_product_status((select v::uuid from t where k = 'p1'), 'archived') $$, 'archive again (idempotent)');
select results_eq(
  $$ select status::text, archived_at is not null from public.products where id = (select v::uuid from t where k = 'p1') $$,
  $$ values ('archived', true) $$,
  'archived with archived_at'
);
select lives_ok($$ select public.set_product_status((select v::uuid from t where k = 'p1'), 'active') $$, 'reactivate');
select throws_ok($$ select public.set_product_status('00000000-0000-4000-9100-000000000b01', 'archived') $$,
  'P0002', null, 'archive a product of another organization → P0002');

reset role;
select results_eq(
  $$ select action, actor_type::text, actor_user_id::text, organization_id::text, object_type, data
       from public.audit_logs where object_id = (select v from t where k = 'p1') order by id $$,
  $$ values ('product.archived', 'user', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-b000-00000000000a', 'product', '{}'::jsonb),
            ('product.reactivated', 'user', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-b000-00000000000a', 'product', '{}'::jsonb) $$,
  'one audit row per real change, ids only'
);
select results_eq(
  $$ select status::text, archived_at is null from public.products where id = (select v::uuid from t where k = 'p1') $$,
  $$ values ('active', true) $$,
  'reactivated clears archived_at'
);

-- ------------------------------------------------------------------------------ 42501 cases
-- Invalid session (no matching auth.sessions row).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-000000000011',
  'role', 'authenticated', 'session_id', gen_random_uuid(), 'aal', 'aal1')::text, true);
set local role authenticated;
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000a', pg_temp.payload(), gen_random_uuid()) $$,
  '42501', null, 'invalid session → 42501');
reset role;

-- D: organization suspended.
select pg_temp.auth_as('00000000-0000-4000-a000-000000000014');
set local role authenticated;
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000d', pg_temp.payload(), gen_random_uuid()) $$,
  '42501', null, 'suspended organization → 42501');
reset role;

-- E: membership suspended.
select pg_temp.auth_as('00000000-0000-4000-a000-000000000015');
set local role authenticated;
select throws_ok($$ select public.set_product_status('00000000-0000-4000-9100-000000000a01', 'archived') $$,
  'P0002', null, 'E cannot see products of A → P0002');
select throws_ok($$ select public.create_product('00000000-0000-4000-b000-00000000000e', pg_temp.payload(), gen_random_uuid()) $$,
  '42501', null, 'suspended membership → 42501');
reset role;

select * from finish();
rollback;
