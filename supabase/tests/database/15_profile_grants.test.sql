-- T145 — profile grants and update_my_profile (US9, FR-035/FR-036).
-- The user only updates onboarding_* directly; full_name/timezone go through update_my_profile, which
-- keeps the personal organization in sync (slug unchanged). Suspended members are rejected.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

-- ---------------------------------------------------------------- seller A (org A active, personal)
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011');
set local role authenticated;

select lives_ok(
  $$ update public.profiles set onboarding_status = 'in_progress', onboarding_step = 2 where user_id = auth.uid() $$,
  'A updates its own onboarding_* directly'
);
select is((select onboarding_step::int from public.profiles where user_id = auth.uid()), 2, 'onboarding_step persisted');
select throws_ok($$ update public.profiles set full_name = 'Hack' where user_id = auth.uid() $$, '42501', null, 'A cannot update full_name directly');
select throws_ok($$ update public.profiles set timezone = 'UTC' where user_id = auth.uid() $$, '42501', null, 'A cannot update timezone directly');
select throws_ok($$ update public.profiles set email = 'x@y.test' where user_id = auth.uid() $$, '42501', null, 'A cannot update email');

-- Another user's profile: RLS hides it, 0 rows affected.
with changed as (
  update public.profiles set onboarding_step = 3
   where user_id = '00000000-0000-4000-a000-000000000012'
  returning 1
)
select is((select count(*)::int from changed), 0, 'A cannot update the profile of B');

select lives_ok($$ select public.update_my_profile('  Ñandú Pgtap Perfil  ', 'America/Bogota') $$, 'update_my_profile accepts a valid name and zone');
select is((select full_name from public.profiles where user_id = auth.uid()), 'Ñandú Pgtap Perfil', 'full_name trimmed and saved');
select is((select timezone from public.profiles where user_id = auth.uid()), 'America/Bogota', 'timezone saved');
select throws_ok($$ select public.update_my_profile('Ana', 'Mars/Olympus') $$, '22023', null, 'invalid zone → 22023');
select throws_ok($$ select public.update_my_profile('   ', 'America/Lima') $$, '23514', null, 'blank name → 23514');
select throws_ok($$ select public.update_my_profile(repeat('x', 81), 'America/Lima') $$, '23514', null, 'name > 80 → 23514');

reset role;
select is((select name from public.organizations where id = '00000000-0000-4000-b000-00000000000a'), 'Ñandú Pgtap Perfil', 'personal org name follows the profile');
select is((select timezone from public.organizations where id = '00000000-0000-4000-b000-00000000000a'), 'America/Bogota', 'personal org timezone follows the profile');
select isnt((select slug from public.organizations where id = '00000000-0000-4000-b000-00000000000a'), 'nandu-pgtap-perfil', 'slug does not change');
select is(
  (select full_name from public.profiles where user_id = '00000000-0000-4000-a000-000000000012'),
  'Bruno Vendedor',
  'B profile untouched'
);

-- ---------------------------------------------------------------- seller D (org D suspended)
select pg_temp.auth_as('00000000-0000-4000-a000-000000000014');
set local role authenticated;

with changed as (
  update public.profiles set onboarding_step = 2 where user_id = auth.uid() returning 1
)
select is((select count(*)::int from changed), 0, 'suspended member cannot update onboarding_* (0 rows)');
select throws_ok($$ select public.update_my_profile('Diego', 'America/Lima') $$, '42501', null, 'suspended member → 42501');

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select throws_ok($$ select public.update_my_profile('Anon', 'America/Lima') $$, '42501', null, 'anon cannot execute update_my_profile');

select * from finish();
rollback;
