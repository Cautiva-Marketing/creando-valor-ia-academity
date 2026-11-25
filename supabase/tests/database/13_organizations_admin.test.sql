-- T128 — organization administration and usage (contracts/database-rpc.md, FR-024a, FR-030–033).
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

create function pg_temp.auth_as(p_user uuid, p_aal text)
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

create function pg_temp.audits(p_action text, p_object text) returns int language sql as $$
  select count(*)::int from public.audit_logs where action = p_action and object_id = p_object
$$;
grant execute on function pg_temp.audits(text, text) to authenticated;

-- Fixtures: two organizations in different time zones with usage around a UTC midnight -------------------
insert into public.organizations (id, type, name, slug, timezone) values
  ('00000000-0000-4000-b000-0000000000f1', 'personal', 'Zona Lima', 'zona-lima-pgtap', 'America/Lima'),
  ('00000000-0000-4000-b000-0000000000f2', 'personal', 'Zona Tokio', 'zona-tokio-pgtap', 'Asia/Tokyo');
insert into public.quotas (organization_id) values
  ('00000000-0000-4000-b000-0000000000f1'), ('00000000-0000-4000-b000-0000000000f2');
-- One product per organization (created by the superadmin account, only to satisfy the FKs) and
-- started sessions: a simulation counts when it is consumed (002, simulation_consumptions).
insert into public.products (id, organization_id, created_by, current_name) values
  ('00000000-0000-4000-9100-0000000000f1', '00000000-0000-4000-b000-0000000000f1', '00000000-0000-4000-a000-000000000001', 'Producto Lima'),
  ('00000000-0000-4000-9100-0000000000f2', '00000000-0000-4000-b000-0000000000f2', '00000000-0000-4000-a000-000000000001', 'Producto Tokio');
insert into public.product_versions (id, organization_id, product_id, version, sector, name, price_kind, price_min, price_max, benefits, created_by) values
  ('00000000-0000-4000-9200-0000000000f1', '00000000-0000-4000-b000-0000000000f1', '00000000-0000-4000-9100-0000000000f1', 1, 'other', 'Producto Lima', 'fixed', 10, 10, array['B'], '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-9200-0000000000f2', '00000000-0000-4000-b000-0000000000f2', '00000000-0000-4000-9100-0000000000f2', 1, 'other', 'Producto Tokio', 'fixed', 10, 10, array['B'], '00000000-0000-4000-a000-000000000001');

create function pg_temp.session(p_id uuid, p_org uuid, p_product uuid, p_version uuid, p_started timestamptz)
returns void
language sql
as $$
  insert into public.practice_sessions (
    id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
    selected_objection_ids, visible_objection, interest, end_reason, setup_idempotency_key, configured_at,
    configured_expires_at, started_at, deadline_at, ended_at, evaluation_status, buyer_setup_prompt_version,
    buyer_prompt_version, buyer_setup_model, buyer_model
  ) values (
    p_id, p_org, '00000000-0000-4000-a000-000000000001', p_product, p_version, 1,
    (case when p_started is null then 'configured' else 'finalized' end)::public.practice_status, 3, array[gen_random_uuid()],
    'Objeción visible', 45, (case when p_started is null then null else 'seller_ended' end)::public.practice_end_reason,
    gen_random_uuid(), coalesce(p_started, now()) - interval '1 minute', coalesce(p_started, now()) + interval '1 day',
    p_started, p_started + interval '20 minutes', p_started + interval '10 minutes',
    (case when p_started is null then null else 'not_applicable' end)::public.evaluation_status, 'v', 'v', 'm', 'm'
  );
  insert into public.simulation_consumptions (session_id, organization_id, user_id, consumed_at)
  select p_id, p_org, '00000000-0000-4000-a000-000000000001', p_started where p_started is not null;
$$;

-- 2026-11-20 03:00 UTC = 19 Nov 22:00 in Lima, 20 Nov 12:00 in Tokyo.
select pg_temp.session('00000000-0000-4000-9000-0000000000f1', '00000000-0000-4000-b000-0000000000f1',
  '00000000-0000-4000-9100-0000000000f1', '00000000-0000-4000-9200-0000000000f1', '2026-11-20T03:00:00Z');
select pg_temp.session('00000000-0000-4000-9000-0000000000f2', '00000000-0000-4000-b000-0000000000f2',
  '00000000-0000-4000-9100-0000000000f2', '00000000-0000-4000-9200-0000000000f2', '2026-11-20T03:00:00Z');
-- A configured persona that never started: it has buyer_setup usage but is not a simulation.
select pg_temp.session('00000000-0000-4000-9000-0000000000f3', '00000000-0000-4000-b000-0000000000f1',
  '00000000-0000-4000-9100-0000000000f1', '00000000-0000-4000-9200-0000000000f1', null);
insert into public.ai_usage (organization_id, task, model, simulation_id, input_tokens, output_tokens, latency_ms, estimated_cost_usd, created_at) values
  ('00000000-0000-4000-b000-0000000000f1', 'buyer_setup', 'm', null, 40, 4, 1, 0.05, '2026-11-20T02:55:00Z'),
  ('00000000-0000-4000-b000-0000000000f1', 'buyer', 'm', '00000000-0000-4000-9000-0000000000f1', 100, 10, 1, 0.5, '2026-11-20T03:00:00Z'),
  ('00000000-0000-4000-b000-0000000000f1', 'evaluator', 'm', '00000000-0000-4000-9000-0000000000f1', 200, 20, 1, 0.25, '2026-11-20T03:05:00Z'),
  ('00000000-0000-4000-b000-0000000000f2', 'buyer', 'm', '00000000-0000-4000-9000-0000000000f2', 300, 30, 1, 1.0, '2026-11-20T03:00:00Z');

-- Expected month simulations of org A, computed as postgres (superadmins cannot read consumptions).
create temp table expected_month_a as
select count(*) as n from public.simulation_consumptions
 where organization_id = '00000000-0000-4000-b000-00000000000a'
   and consumed_at >= date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima';
grant select on expected_month_a to authenticated;

-- Not authorized ------------------------------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal1');
set local role authenticated;
select throws_ok($$ select * from public.admin_list_organizations(null, 20, 0) $$, '42501', null, 'aal1 cannot list organizations');
select throws_ok($$ select public.admin_update_quota('00000000-0000-4000-b000-0000000000f1', 1, 2) $$, '42501', null, 'aal1 cannot update quota');
select throws_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'suspended', 'x') $$, '42501', null, 'aal1 cannot suspend');
select throws_ok($$ select * from public.admin_usage_summary('2026-11-01', '2026-11-30') $$, '42501', null, 'aal1 cannot read usage');
reset role;

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal2');
set local role authenticated;
select throws_ok($$ select * from public.admin_list_organizations(null, 20, 0) $$, '42501', null, 'seller cannot list organizations');
reset role;

-- Superadmin aal2 -----------------------------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;

-- List
select is(
  (select row(name, type::text, status::text, daily_limit, monthly_limit)::text
     from public.admin_list_organizations('zona lima', 20, 0)),
  row('Zona Lima', 'personal', 'active', 10, 100)::text, 'list returns quota columns, filtered by name'
);
select ok((select total_count >= 7 from public.admin_list_organizations(null, 1, 0)), 'total_count counts every organization');
select is(
  (select month_simulations from public.admin_list_organizations('Ana Vendedora', 20, 0)),
  (select n from expected_month_a),
  'month_simulations = consumptions of the current local month'
);

-- Quota
select throws_ok($$ select public.admin_update_quota('00000000-0000-4000-b000-0000000000f1', 5, 3) $$, '23514', null, 'daily > monthly → 23514');
select throws_ok($$ select public.admin_update_quota('00000000-0000-4000-b000-0000000000f1', -1, 3) $$, '23514', null, 'negative → 23514');
select lives_ok($$ select public.admin_update_quota('00000000-0000-4000-b000-0000000000f1', 3, 50) $$, '3/50 saves');
select is(
  (select row(daily_limit, monthly_limit, updated_by)::text from public.quotas where organization_id = '00000000-0000-4000-b000-0000000000f1'),
  row(3, 50, '00000000-0000-4000-a000-000000000001'::uuid)::text, 'quota stored with updated_by'
);
select is(pg_temp.audits('quota.updated', '00000000-0000-4000-b000-0000000000f1'), 1, 'quota.updated audited once');
select is(
  (select data from public.audit_logs where action = 'quota.updated' and object_id = '00000000-0000-4000-b000-0000000000f1'),
  '{"after": {"daily_limit": 3, "monthly_limit": 50}, "before": {"daily_limit": 10, "monthly_limit": 100}}'::jsonb,
  'audit has before/after'
);
select lives_ok($$ select public.admin_update_quota('00000000-0000-4000-b000-0000000000f1', 3, 50) $$, 'same values is a no-op');
select is(pg_temp.audits('quota.updated', '00000000-0000-4000-b000-0000000000f1'), 1, 'no-op does not audit');

-- Suspend / reactivate
select throws_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'suspended', '   ') $$, '23514', null, 'reason with only spaces → 23514');
select throws_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'suspended', repeat('x', 501)) $$, '23514', null, 'reason > 500 → 23514');
select throws_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'active', null) $$, 'P0010', null, 'already active → P0010');
select lives_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'suspended', '  Impago  ') $$, 'suspend with reason');
select is(
  (select row(status::text, suspended_reason, suspended_at is not null, suspended_by)::text from public.organizations where id = '00000000-0000-4000-b000-0000000000f1'),
  row('suspended', 'Impago', true, '00000000-0000-4000-a000-000000000001'::uuid)::text, 'suspension stored (trimmed reason)'
);
select throws_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'suspended', 'otra') $$, 'P0010', null, 'already suspended → P0010');
select is(pg_temp.audits('organization.suspended', '00000000-0000-4000-b000-0000000000f1'), 1, 'organization.suspended audited');
select lives_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-0000000000f1', 'active', null) $$, 'reactivate');
select is(
  (select row(status::text, suspended_reason, suspended_at is not null, suspended_by)::text from public.organizations where id = '00000000-0000-4000-b000-0000000000f1'),
  row('active', 'Impago', true, '00000000-0000-4000-a000-000000000001'::uuid)::text, 'reactivation keeps the last suspension'
);
select is(
  (select data from public.audit_logs where action = 'organization.reactivated' and object_id = '00000000-0000-4000-b000-0000000000f1'),
  '{"previous_reason": "Impago"}'::jsonb, 'organization.reactivated audited with previous_reason'
);

-- Suspending org A cuts its seller off immediately
select lives_ok($$ select public.admin_set_organization_status('00000000-0000-4000-b000-00000000000a', 'suspended', 'Prueba') $$, 'suspend org A');
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1');
set local role authenticated;
select is((select count(*)::int from public.organizations), 0, 'suspended seller reads no organizations');
select is((select count(*)::int from public.memberships where organization_id = '00000000-0000-4000-b000-00000000000a'), 0, 'nor memberships of the org');
select is((select count(*)::int from public.quotas), 0, 'nor quotas');
select is((select count(*)::int from public.ai_usage), 0, 'nor usage');
reset role;

-- Usage summary respects each organization's time zone
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;
select set_eq(
  $$ select organization_id from public.admin_usage_summary('2026-11-20', '2026-11-20')
      where organization_id in ('00000000-0000-4000-b000-0000000000f1', '00000000-0000-4000-b000-0000000000f2') $$,
  $$ values ('00000000-0000-4000-b000-0000000000f2'::uuid) $$,
  '20 Nov local: only Tokyo'
);
select set_eq(
  $$ select organization_id from public.admin_usage_summary('2026-11-19', '2026-11-19')
      where organization_id in ('00000000-0000-4000-b000-0000000000f1', '00000000-0000-4000-b000-0000000000f2') $$,
  $$ values ('00000000-0000-4000-b000-0000000000f1'::uuid) $$,
  '19 Nov local: only Lima'
);
select is(
  (select row(simulations, input_tokens, output_tokens, estimated_cost_usd)::text
     from public.admin_usage_summary('2026-11-19', '2026-11-19') where organization_id = '00000000-0000-4000-b000-0000000000f1'),
  row(1::bigint, 340::bigint, 34::bigint, 0.800000::numeric)::text,
  'one started simulation (the unstarted persona does not count); tokens and cost include buyer_setup'
);
select throws_ok($$ select * from public.admin_usage_summary('2026-11-30', '2026-11-01') $$, '22023', null, 'from > to → 22023');
reset role;

-- admin_usage_summary only reads organizations, ai_usage and simulation_consumptions (no content)
select set_eq(
  $$ select distinct m[1] from pg_proc p,
       regexp_matches(p.prosrc, 'public\.([a-z_]+)', 'g') as m
      where p.proname = 'admin_usage_summary'
        and m[1] not in ('organization_type', 'organization_status') $$,
  $$ values ('ai_usage'), ('organizations'), ('simulation_consumptions') $$,
  'admin_usage_summary only references organizations, ai_usage and simulation_consumptions'
);
select is(
  (select count(*)::int from pg_depend d join pg_proc p on p.oid = d.objid
     join pg_class c on c.oid = d.refobjid
    where p.proname = 'admin_usage_summary' and c.relname not in ('organizations', 'ai_usage', 'simulation_consumptions')),
  0, 'pg_depend records no other relation'
);

select * from finish();
rollback;
