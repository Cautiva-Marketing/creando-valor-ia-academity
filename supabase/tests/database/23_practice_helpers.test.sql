-- T023 — practice helpers: quota in the organization time zone (FR-017, FR-018), initial interest
-- (FR-010), mood bands (FR-026) and insert_ai_usage grants/validation (FR-019).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Organization C (no seeded consumptions) in America/Lima (UTC-5, no DST).
update public.organizations set timezone = 'America/Lima' where id = '00000000-0000-4000-b000-00000000000c';
update public.quotas set daily_limit = 2, monthly_limit = 4 where organization_id = '00000000-0000-4000-b000-00000000000c';

-- Consumption at 23:30 local time yesterday, 04:30 UTC today.
create function pg_temp.consume(p_at timestamptz)
returns void
language plpgsql
as $$
declare
  v_session uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.products (id, organization_id, created_by, current_name)
  values (v_product, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Producto C');
  insert into public.product_versions (id, organization_id, product_id, version, sector, name, description, price_kind,
    price_min, price_max, benefits, differentiators, verifiable_facts, created_by)
  values (v_version, '00000000-0000-4000-b000-00000000000c', v_product, 1, 'other', 'Producto C', 'Descripción', 'fixed',
    10, 10, array['Beneficio'], '{}', '{}', '00000000-0000-4000-a000-000000000013');
  insert into public.practice_sessions (
    id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
    selected_objection_ids, visible_objection, interest, end_reason, setup_idempotency_key, configured_at,
    configured_expires_at, started_at, deadline_at, ended_at, evaluation_status, buyer_setup_prompt_version,
    buyer_prompt_version, buyer_setup_model, buyer_model
  ) values (
    v_session, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', v_product, v_version, 1,
    'finalized', 3, array[gen_random_uuid()], 'Objeción visible', 45, 'seller_ended', gen_random_uuid(), p_at - interval '1 minute',
    p_at + interval '1 day', p_at, p_at + interval '20 minutes', p_at + interval '5 minutes', 'not_applicable',
    'v', 'v', 'm', 'm'
  );
  insert into public.simulation_consumptions (session_id, organization_id, user_id, consumed_at)
  values (v_session, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', p_at);
end;
$$;

create function pg_temp.lima_today() returns timestamp
language sql stable as $$ select date_trunc('day', now() at time zone 'America/Lima') $$;

-- ---------------------------------------------------------------- quota
select results_eq(
  $$ select daily_used, monthly_used, remaining_today, remaining_month, exhausted_scope from private.practice_quota_status('00000000-0000-4000-b000-00000000000c') $$,
  $$ values (0, 0, 2, 4, null::text) $$,
  'no consumption: everything available'
);

-- 23:30 local of yesterday only counts for yesterday (and this month, unless today is the 1st).
select pg_temp.consume((pg_temp.lima_today() - interval '30 minutes') at time zone 'America/Lima');
select is(
  (select daily_used from private.practice_quota_status('00000000-0000-4000-b000-00000000000c')),
  0, 'a consumption at 23:30 local yesterday does not count today'
);

-- Today at 00:30 local.
select pg_temp.consume((pg_temp.lima_today() + interval '30 minutes') at time zone 'America/Lima');
select is(
  (select daily_used from private.practice_quota_status('00000000-0000-4000-b000-00000000000c')),
  1, 'a consumption at 00:30 local counts today'
);
select pg_temp.consume(now() - interval '1 second');
select results_eq(
  $$ select exhausted_scope, renews_at from private.practice_quota_status('00000000-0000-4000-b000-00000000000c') $$,
  $$ values ('daily'::text, (pg_temp.lima_today() + interval '1 day') at time zone 'America/Lima') $$,
  'daily limit reached: renews at the start of the next local day'
);
select is(
  (select remaining_today from private.practice_quota_status('00000000-0000-4000-b000-00000000000c')),
  0, 'no remaining simulations today'
);

-- Monthly limit reached together with the daily one: the monthly renewal wins.
update public.quotas set daily_limit = 3, monthly_limit = 3 where organization_id = '00000000-0000-4000-b000-00000000000c';
select pg_temp.consume(now() - interval '2 seconds');
select results_eq(
  $$ select exhausted_scope, renews_at, remaining_today from private.practice_quota_status('00000000-0000-4000-b000-00000000000c') $$,
  $$ values ('monthly'::text, (date_trunc('month', now() at time zone 'America/Lima') + interval '1 month') at time zone 'America/Lima', 0) $$,
  'monthly limit reached: renews at the start of the next local month'
);

update public.quotas set daily_limit = 0 where organization_id = '00000000-0000-4000-b000-00000000000c';
select results_eq(
  $$ select exhausted_scope, renews_at from private.practice_quota_status('00000000-0000-4000-b000-00000000000c') $$,
  $$ values ('disabled'::text, null::timestamptz) $$,
  'limit 0 disables practice with no renewal date'
);

select throws_ok(
  $$ select * from private.practice_quota_status('00000000-0000-4000-b000-0000000000ff') $$,
  'P0002', null, 'unknown organization raises not_found'
);

-- ---------------------------------------------------------------- initial interest and mood
select is(private.initial_interest(1), 55::smallint, 'difficulty 1 starts at 55');
select is(private.initial_interest(2), 50::smallint, 'difficulty 2 starts at 50');
select is(private.initial_interest(3), 45::smallint, 'difficulty 3 starts at 45');
select is(private.initial_interest(4), 35::smallint, 'difficulty 4 starts at 35');
select is(private.initial_interest(5), 25::smallint, 'difficulty 5 starts at 25');

select is(private.mood(29), 'distrustful', 'interest 29 is distrustful');
select is(private.mood(30), 'doubtful', 'interest 30 is doubtful');
select is(private.mood(54), 'doubtful', 'interest 54 is doubtful');
select is(private.mood(55), 'interested', 'interest 55 is interested');
select is(private.mood(79), 'interested', 'interest 79 is interested');
select is(private.mood(80), 'ready', 'interest 80 is ready');

-- ---------------------------------------------------------------- insert_ai_usage
select ok(not has_function_privilege('authenticated', 'public.insert_ai_usage(jsonb)', 'execute'), 'authenticated cannot execute insert_ai_usage');
select ok(not has_function_privilege('authenticated', 'private.practice_quota_status(uuid)', 'execute'), 'authenticated cannot execute practice_quota_status');

set local role service_role;
select throws_ok(
  $$ select public.insert_ai_usage('{"organization_id": "00000000-0000-4000-b000-00000000000a", "task": "buyer", "model": "m", "content": "x"}') $$,
  '22023', null, 'unknown keys (such as content) are rejected'
);
select throws_ok(
  $$ select public.insert_ai_usage('{"organization_id": "00000000-0000-4000-b000-00000000000a", "task": "buyer", "model": "m", "simulation_id": "00000000-0000-4000-9000-000000000b01"}') $$,
  '23514', null, 'buyer usage must reference a session of the same organization'
);
select lives_ok(
  $$ select public.insert_ai_usage('{"organization_id": "00000000-0000-4000-b000-00000000000a", "user_id": "00000000-0000-4000-a000-000000000011", "task": "buyer_setup", "model": "m", "outcome": "retry", "attempt": 2}') $$,
  'buyer_setup usage without session is recorded'
);
reset role;

select * from finish();
rollback;
