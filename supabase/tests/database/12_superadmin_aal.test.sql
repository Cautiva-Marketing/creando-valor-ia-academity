-- T079 — superadmin aal (FR-025, FR-027a): request context fields, is_superadmin() only with aal2,
-- revoke_user_sessions deletes sessions and only service_role can execute it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.auth_as(p_user uuid, p_aal text default 'aal1')
returns uuid
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
  return v_sid;
end;
$$;

-- Superadmin with factor, aal1 ----------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal1');
set local role authenticated;
select is((public.get_request_context() ->> 'aal'), 'aal1', 'context reports aal1');
select is((public.get_request_context() ->> 'is_superadmin_account')::boolean, true, 'context reports a superadmin account');
select is((public.get_request_context() ->> 'has_verified_factor')::boolean, true, 'context reports the verified factor');
select is((select count(*) from public.invitations)::int, 0, 'aal1 superadmin cannot read invitations');
reset role;
-- private.* is evaluated by the owner (authenticated has no USAGE on private); same JWT claims.
select ok(not private.is_superadmin(), 'is_superadmin() is false with aal1');

-- Same superadmin, aal2 -----------------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;
select is((public.get_request_context() ->> 'aal'), 'aal2', 'context reports aal2');
select ok((select count(*) from public.invitations) > 0, 'aal2 superadmin reads invitations');
reset role;
select ok(private.is_superadmin(), 'is_superadmin() is true with aal2');

-- Superadmin without factor ---------------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000002', 'aal1');
set local role authenticated;
select is((public.get_request_context() ->> 'has_verified_factor')::boolean, false, 'no verified factor reported');
reset role;

-- Seller A is never a superadmin, even with an aal2 claim --------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal2');
select ok(not private.is_superadmin(), 'a seller is never superadmin');

-- revoke_user_sessions ---------------------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000002', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select public.revoke_user_sessions('00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'authenticated cannot execute revoke_user_sessions'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.revoke_user_sessions('00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'anon cannot execute revoke_user_sessions'
);
reset role;

set local role service_role;
select ok(
  public.revoke_user_sessions('00000000-0000-4000-a000-000000000002') >= 2,
  'service_role revokes every session of the user'
);
reset role;
select is(
  (select count(*) from auth.sessions where user_id = '00000000-0000-4000-a000-000000000002')::int, 0,
  'no sessions remain for the user'
);

select * from finish();
rollback;
