-- T025 — A/B isolation suite (AC-01, FR-005, FR-024). Seller A never sees or changes B's data;
-- suspended organizations and suspended memberships see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

-- ---------------------------------------------------------------- seller A (org A active)
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;

select is((select count(*)::int from public.organizations where id = '00000000-0000-4000-b000-00000000000a'), 1, 'A sees own organization');
select is((select count(*)::int from public.organizations where id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no organization of B');
select is((select count(*)::int from public.memberships where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no membership of B');
select is((select count(*)::int from public.teams where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no team of B');
select is((select count(*)::int from public.quotas where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no quota of B');
select is((select count(*)::int from public.ai_usage where organization_id = '00000000-0000-4000-b000-00000000000b'), 0, 'A sees no AI usage of B');
select is((select count(*)::int from public.ai_usage), 3, 'A sees only its own AI usage rows');

select throws_ok($$ insert into public.organizations (type, name, slug) values ('personal', 'Hack', 'hack') $$, '42501', null, 'A cannot insert organizations');
select throws_ok($$ insert into public.memberships (organization_id, user_id, roles, joined_at) values ('00000000-0000-4000-b000-00000000000b', auth.uid(), '{vendedor}', now()) $$, '42501', null, 'A cannot insert memberships');
select throws_ok($$ insert into public.teams (organization_id, name) values ('00000000-0000-4000-b000-00000000000b', 'Hack') $$, '42501', null, 'A cannot insert teams');
select throws_ok($$ insert into public.quotas (organization_id) values ('00000000-0000-4000-b000-00000000000b') $$, '42501', null, 'A cannot insert quotas');
select throws_ok($$ insert into public.ai_usage (organization_id, task, model, input_tokens, output_tokens, latency_ms, estimated_cost_usd) values ('00000000-0000-4000-b000-00000000000b', 'buyer', 'x', 1, 1, 1, 0) $$, '42501', null, 'A cannot insert AI usage');

select throws_ok($$ update public.organizations set name = 'Hack' where id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot update organizations');
select throws_ok($$ update public.memberships set status = 'suspended' where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot update memberships');
select throws_ok($$ update public.teams set name = 'Hack' where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot update teams');
select throws_ok($$ update public.quotas set daily_limit = 0 where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot update quotas');
select throws_ok($$ update public.ai_usage set input_tokens = 0 where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot update AI usage');

select throws_ok($$ delete from public.organizations where id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot delete organizations');
select throws_ok($$ delete from public.memberships where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot delete memberships');
select throws_ok($$ delete from public.teams where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot delete teams');
select throws_ok($$ delete from public.quotas where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot delete quotas');
select throws_ok($$ delete from public.ai_usage where organization_id = '00000000-0000-4000-b000-00000000000b' $$, '42501', null, 'A cannot delete AI usage');

-- ---------------------------------------------------------------- seller D (org D suspended)
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000014');
set local role authenticated;
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.quotas)
    + (select count(*)::int from public.memberships),
  0,
  'a member of a suspended organization sees no rows, not even its own'
);

-- ---------------------------------------------------------------- seller E (suspended membership)
reset role;
select pg_temp.auth_as('00000000-0000-4000-a000-000000000015');
set local role authenticated;
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.quotas)
    + (select count(*)::int from public.memberships),
  0,
  'a suspended membership in an active organization sees no rows'
);
reset role;
select ok(not private.is_operative_user(), 'a suspended membership is not an operative user');

select * from finish();
rollback;
