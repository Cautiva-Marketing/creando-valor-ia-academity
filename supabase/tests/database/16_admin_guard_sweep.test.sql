-- T179 — guard sweep (SC-005): every public.admin_* function rejects (42501) a superadmin with aal1
-- and a seller, so a new admin_* function without guard makes this suite fail. With aal1, the
-- superadmin-only tables return zero rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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

-- Calls every public.admin_* function with NULL arguments as the current role and returns those that
-- did NOT fail with 42501 (name + the error they raised, or "no error").
create function pg_temp.unguarded_admin_functions()
returns text[]
language plpgsql
as $$
declare
  v_fn record;
  v_args text;
  v_leaks text[] := '{}';
begin
  for v_fn in
    select p.oid, p.proname, p.pronargs
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
     order by p.proname
  loop
    select coalesce(string_agg('null', ', '), '') into v_args from generate_series(1, v_fn.pronargs);
    begin
      execute format('select public.%I(%s)', v_fn.proname, v_args);
      v_leaks := v_leaks || (v_fn.proname || ': no error');
    exception
      when insufficient_privilege then null; -- 42501: guarded
      when others then v_leaks := v_leaks || (v_fn.proname || ': ' || sqlstate);
    end;
  end loop;
  return v_leaks;
end;
$$;
grant execute on function pg_temp.unguarded_admin_functions() to authenticated, anon;

select cmp_ok(
  (select count(*)::int from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'),
  '>=', 10,
  'the sweep sees the admin_* functions'
);

-- Superadmin with verified factor but aal1 ---------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal1');
set local role authenticated;
select is(pg_temp.unguarded_admin_functions(), '{}'::text[], 'every admin_* rejects a superadmin with aal1 (42501)');
select is((select count(*)::int from public.invitations), 0, 'aal1: no invitations visible');
select is((select count(*)::int from public.access_requests), 0, 'aal1: no access requests visible');
select is((select count(*)::int from public.audit_logs), 0, 'aal1: no audit logs visible');
reset role;

-- Seller (even with an aal2 JWT) -----------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal2');
set local role authenticated;
select is(pg_temp.unguarded_admin_functions(), '{}'::text[], 'every admin_* rejects a seller (42501)');
select is((select count(*)::int from public.invitations), 0, 'seller: no invitations visible');
reset role;

-- Anonymous --------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(pg_temp.unguarded_admin_functions(), '{}'::text[], 'every admin_* rejects anon (42501)');
reset role;

-- Control: the sweep does detect a function that runs for a superadmin with aal2 ------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;
select isnt(pg_temp.unguarded_admin_functions(), '{}'::text[], 'control: with aal2 the functions run past the guard');
reset role;

-- 002 (T068): the organization and usage admin functions read only organizations, quotas, ai_usage
-- and simulation_consumptions, never practice content.
select is(
  (select array_agg(distinct m[1] order by m[1]) from pg_proc p,
       regexp_matches(p.prosrc, 'public\.([a-z_]+)', 'g') as m
      where p.proname in ('admin_list_organizations', 'admin_usage_summary')
        and m[1] not in ('organization_type', 'organization_status')),
  array['ai_usage', 'organizations', 'quotas', 'simulation_consumptions'],
  'admin_list_organizations/admin_usage_summary only reference organizations, quotas, ai_usage and simulation_consumptions'
);

select * from finish();
rollback;
