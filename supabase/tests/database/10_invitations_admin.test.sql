-- T089 — invitation administration functions (contracts/database-rpc.md, FR-009/010/013).
-- Concurrency is serialized by FOR UPDATE / advisory locks; here the duplicates are sequential.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

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

create function pg_temp.h(p text) returns bytea language sql as $$ select extensions.digest(p, 'sha256') $$;

create function pg_temp.audits(p_action text, p_object text) returns int language sql as $$
  select count(*)::int from public.audit_logs where action = p_action and object_id = p_object
$$;

-- Orphan auth account (no memberships, not superadmin) for "huérfana no bloquea".
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000f1', 'authenticated',
  'authenticated', 'huerfana@ejemplo.test', '', now(), '{}', '{}', now(), now());

grant execute on function pg_temp.h(text) to authenticated;
grant execute on function pg_temp.audits(text, text) to authenticated;

-- Not authorized: seller A (aal2 claim) and superadmin with aal1 -----------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal2');
set local role authenticated;
select throws_ok($$ select * from public.admin_list_invitations(null, null, 20, 0) $$, '42501', null, 'seller cannot list');
select throws_ok($$ select * from public.admin_create_invitation('x@ejemplo.test', 7, pg_temp.h('t-x'), null, gen_random_uuid()) $$, '42501', null, 'seller cannot create');
select throws_ok($$ select * from public.admin_resend_invitation('00000000-0000-4000-e000-000000000001', pg_temp.h('t-y'), gen_random_uuid()) $$, '42501', null, 'seller cannot resend');
select throws_ok($$ select public.admin_mark_invitation_sent('00000000-0000-4000-e000-000000000001', true) $$, '42501', null, 'seller cannot mark sent');
select throws_ok($$ select * from public.admin_revoke_invitation('00000000-0000-4000-e000-000000000001') $$, '42501', null, 'seller cannot revoke');
reset role;

select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal1');
set local role authenticated;
select throws_ok($$ select * from public.admin_list_invitations(null, null, 20, 0) $$, '42501', null, 'aal1 cannot list');
select throws_ok($$ select * from public.admin_create_invitation('x@ejemplo.test', 7, pg_temp.h('t-x'), null, gen_random_uuid()) $$, '42501', null, 'aal1 cannot create');
select throws_ok($$ select * from public.admin_resend_invitation('00000000-0000-4000-e000-000000000001', pg_temp.h('t-y'), gen_random_uuid()) $$, '42501', null, 'aal1 cannot resend');
select throws_ok($$ select public.admin_mark_invitation_sent('00000000-0000-4000-e000-000000000001', true) $$, '42501', null, 'aal1 cannot mark sent');
select throws_ok($$ select * from public.admin_revoke_invitation('00000000-0000-4000-e000-000000000001') $$, '42501', null, 'aal1 cannot revoke');
reset role;

-- Superadmin aal2 ---------------------------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;

-- Create + idempotency
create temp table k (name text primary key, value uuid) on commit drop;
grant all on k to authenticated;
insert into k values ('create', gen_random_uuid()), ('resend1', gen_random_uuid()), ('resend2', gen_random_uuid());

create temp table created on commit drop as
  select * from public.admin_create_invitation('  Nueva.Persona@Ejemplo.TEST ', 7, pg_temp.h('tok-1'), null, (select value from k where name = 'create'));
grant all on created to authenticated;
select is((select duplicate from created), false, 'create returns duplicate = false');
select is(
  (select email from public.invitations where id = (select invitation_id from created)),
  'nueva.persona@ejemplo.test', 'email is normalized'
);
select ok(
  (select expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
     from public.invitations where id = (select invitation_id from created)),
  'expires_at = now + 7 days'
);
select is(
  (select duplicate from public.admin_create_invitation('nueva.persona@ejemplo.test', 7, pg_temp.h('tok-2'), null, (select value from k where name = 'create'))),
  true, 'same idempotency key → duplicate = true'
);
select is(
  (select invitation_id from public.admin_create_invitation('nueva.persona@ejemplo.test', 7, pg_temp.h('tok-3'), null, (select value from k where name = 'create'))),
  (select invitation_id from created), 'same idempotency key → same invitation'
);
select is(pg_temp.audits('invitation.created', (select invitation_id::text from created)), 1, 'exactly one invitation.created');

-- Uniqueness
select throws_ok(
  $$ select * from public.admin_create_invitation('NUEVA.persona@ejemplo.test ', 7, pg_temp.h('tok-4'), null, gen_random_uuid()) $$,
  'P0012', 'open invitation', 'open invitation (normalized email) → P0012'
);
select throws_ok(
  $$ select * from public.admin_create_invitation('invitacion.vencida@ejemplo.test', 7, pg_temp.h('tok-5'), null, gen_random_uuid()) $$,
  'P0012', 'open invitation', 'an expired invitation also counts as open'
);
select throws_ok(
  $$ select * from public.admin_create_invitation('vendedor.b@ejemplo.test', 7, pg_temp.h('tok-6'), null, gen_random_uuid()) $$,
  'P0012', 'account exists', 'account with membership → P0012 account_exists'
);
select throws_ok(
  $$ select * from public.admin_create_invitation('superadmin.sinfactor@ejemplo.test', 7, pg_temp.h('tok-7'), null, gen_random_uuid()) $$,
  'P0012', 'account exists', 'superadmin account → P0012 account_exists'
);
select lives_ok(
  $$ select * from public.admin_create_invitation('huerfana@ejemplo.test', 7, pg_temp.h('tok-8'), null, gen_random_uuid()) $$,
  'an orphan account does not block'
);
select throws_ok(
  $$ select * from public.admin_create_invitation('otra@ejemplo.test', 31, pg_temp.h('tok-9'), null, gen_random_uuid()) $$,
  '22023', null, 'days out of 1..30 → 22023'
);

-- DETAIL values (checked as owner via exception handler)
reset role;
create function pg_temp.detail_of(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  return v;
end;
$$;
select is(
  pg_temp.detail_of($$ select * from public.admin_create_invitation('vendedor.b@ejemplo.test', 7, extensions.digest('d-1', 'sha256'), null, gen_random_uuid()) $$),
  'account_exists', 'DETAIL account_exists'
);
select is(
  pg_temp.detail_of($$ select * from public.admin_create_invitation('invitacion.vencida@ejemplo.test', 7, extensions.digest('d-2', 'sha256'), null, gen_random_uuid()) $$),
  'open_invitation:00000000-0000-4000-e000-000000000003', 'DETAIL open_invitation:<id>'
);
set local role authenticated;

-- invitation_status
select is(public.invitation_status(null, null, now() + interval '1 day'), 'pending', 'status pending');
select is(public.invitation_status(now(), null, now() - interval '1 day'), 'accepted', 'status accepted');
select is(public.invitation_status(null, null, now() - interval '1 second'), 'expired', 'status expired');
select is(public.invitation_status(null, now(), now() + interval '1 day'), 'revoked', 'status revoked');

-- Resend (expired seed invitation → pending again)
select is(
  (select duplicate from public.admin_resend_invitation('00000000-0000-4000-e000-000000000003', pg_temp.h('res-1'), (select value from k where name = 'resend1'))),
  false, 'resend from expired works'
);
select ok(
  (select token_hash = pg_temp.h('res-1') and expires_at > now() + interval '23 hours'
          and resend_idempotency_key = (select value from k where name = 'resend1')
     from public.invitations where id = '00000000-0000-4000-e000-000000000003'),
  'resend replaces token_hash, restarts expires_at (1 day) and stores the key'
);
select is(
  (select duplicate from public.admin_resend_invitation('00000000-0000-4000-e000-000000000003', pg_temp.h('res-2'), (select value from k where name = 'resend1'))),
  true, 'same resend key → duplicate = true'
);
select ok(
  (select token_hash = pg_temp.h('res-1') from public.invitations where id = '00000000-0000-4000-e000-000000000003'),
  'duplicate resend keeps the token_hash'
);
select is(pg_temp.audits('invitation.resent', '00000000-0000-4000-e000-000000000003'), 1, 'exactly one invitation.resent for the key');
select is(
  (select duplicate from public.admin_resend_invitation('00000000-0000-4000-e000-000000000003', pg_temp.h('res-3'), (select value from k where name = 'resend2'))),
  false, 'a new key resends again'
);
select is(pg_temp.audits('invitation.resent', '00000000-0000-4000-e000-000000000003'), 2, 'second key → second invitation.resent');
select throws_ok(
  $$ select * from public.admin_resend_invitation('00000000-0000-4000-e000-000000000002', pg_temp.h('res-4'), gen_random_uuid()) $$,
  'P0010', null, 'cannot resend an accepted invitation'
);

-- Mark sent
select lives_ok($$ select public.admin_mark_invitation_sent('00000000-0000-4000-e000-000000000003', false) $$, 'mark failed');
select ok(
  (select send_status = 'failed' and send_attempts = 2 from public.invitations where id = '00000000-0000-4000-e000-000000000003'),
  'failed send recorded (attempts incremented)'
);

-- Revoke
select is((select duplicate from public.admin_revoke_invitation('00000000-0000-4000-e000-000000000001')), false, 'revoke pending');
select is((select duplicate from public.admin_revoke_invitation('00000000-0000-4000-e000-000000000001')), true, 'second revoke → duplicate');
select is(pg_temp.audits('invitation.revoked', '00000000-0000-4000-e000-000000000001'), 1, 'exactly one invitation.revoked');
select throws_ok($$ select * from public.admin_revoke_invitation('00000000-0000-4000-e000-000000000002') $$, 'P0010', null, 'revoking an accepted invitation → P0010');

-- Convert an access request
select is(
  (select duplicate from public.admin_create_invitation('solicitud.nueva@ejemplo.test', 7, pg_temp.h('conv-1'), '00000000-0000-4000-f000-000000000001', gen_random_uuid())),
  false, 'convert a new access request'
);
select is(
  (select status::text from public.access_requests where id = '00000000-0000-4000-f000-000000000001'),
  'invited', 'request is marked invited'
);
select is(pg_temp.audits('access_request.converted', '00000000-0000-4000-f000-000000000001'), 1, 'exactly one access_request.converted');

-- List filters
select ok(
  not exists (select 1 from public.admin_list_invitations('revoked', null, 100, 0) where status <> 'revoked'),
  'status filter returns only that status'
);
select is(
  (select count(*)::int from public.admin_list_invitations(null, 'NUEVA.persona', 20, 0)),
  1, 'search by email (case-insensitive)'
);
select throws_ok($$ select * from public.admin_list_invitations('pendiente', null, 20, 0) $$, '22023', null, 'unknown status → 22023');
reset role;

select * from finish();
rollback;
