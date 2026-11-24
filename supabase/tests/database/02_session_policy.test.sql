-- T024 — session policy (FR-019, research.md §R7): sellers 30 d max life + 7 d inactivity;
-- superadmin 12 h max life; is_superadmin() requires aal2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Creates a simulated auth.sessions row and sets the JWT claims for it (runs as postgres).
create function pg_temp.auth_as(
  p_user uuid,
  p_aal text default 'aal1',
  p_age interval default interval '1 minute',
  p_refreshed_ago interval default null
)
returns uuid
language plpgsql
as $$
declare
  v_sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at, aal, refreshed_at)
  values (
    v_sid, p_user, now() - p_age, now(), p_aal::auth.aal_level,
    case when p_refreshed_ago is null then null else (now() - p_refreshed_ago) at time zone 'UTC' end
  );
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', v_sid, 'aal', p_aal)::text,
    true
  );
  return v_sid;
end;
$$;

-- Seller A
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1', interval '1 hour');
select ok(private.current_session_ok(), 'fresh seller session is valid');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1', interval '31 days', interval '1 hour');
select ok(not private.current_session_ok(), 'seller session older than 30 days is invalid');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1', interval '10 days', interval '8 days');
select ok(not private.current_session_ok(), 'seller session without refresh for more than 7 days is invalid');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1', interval '10 days', interval '1 day');
select ok(private.current_session_ok(), 'seller session refreshed recently is valid within 30 days');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1', interval '8 days');
select ok(not private.current_session_ok(), 'never-refreshed seller session older than 7 days is invalid');

-- A session that belongs to another user is not accepted
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-a000-000000000012', 'role', 'authenticated', 'aal', 'aal1',
    'session_id', pg_temp.auth_as('00000000-0000-4000-a000-000000000011')
  )::text,
  true
);
select ok(not private.current_session_ok(), 'session_id of another user is rejected');

-- Superadmin
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2', interval '1 hour');
select ok(private.is_superadmin(), 'superadmin with aal2 and a fresh session is superadmin');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2', interval '13 hours', interval '5 minutes');
select ok(not private.current_session_ok(), 'superadmin session older than 12 hours is invalid');
select ok(not private.is_superadmin(), 'superadmin with an expired session is not superadmin');

select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal1', interval '1 hour');
select ok(not private.is_superadmin(), 'superadmin with aal1 is not superadmin');

select * from finish();
rollback;
