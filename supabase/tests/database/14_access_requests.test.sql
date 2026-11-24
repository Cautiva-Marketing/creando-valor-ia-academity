-- T153 — access requests: no direct writes, manual discard, retention (FR-049/FR-049a, research.md §R12).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

create function pg_temp.audits(p_action text, p_object text, p_actor text) returns int language sql as $$
  select count(*)::int from public.audit_logs
   where action = p_action and object_id = p_object and actor_type::text = p_actor
$$;
grant execute on function pg_temp.audits(text, text, text) to authenticated;

-- Fixtures ------------------------------------------------------------------------------------------------
insert into public.access_requests (id, full_name, email, company_or_role, message, privacy_document_id, privacy_accepted_at, status, discarded_at, created_at) values
  -- recent new (manual discard target)
  ('00000000-0000-4000-f000-0000000000a1', 'Pgtap Uno', 'pgtap.uno@ejemplo.test', 'Empresa', 'Hola',
     '00000000-0000-4000-c000-000000000003', now(), 'new', null, now() - interval '1 day'),
  -- new older than 180 days (retention → discarded)
  ('00000000-0000-4000-f000-0000000000a2', 'Pgtap Dos', 'pgtap.dos@ejemplo.test', null, null,
     '00000000-0000-4000-c000-000000000003', now() - interval '200 days', 'new', null, now() - interval '200 days'),
  -- discarded more than 90 days ago (retention → anonymized)
  ('00000000-0000-4000-f000-0000000000a3', 'Pgtap Tres', 'pgtap.tres@ejemplo.test', 'Empresa', 'Mensaje',
     '00000000-0000-4000-c000-000000000003', now() - interval '120 days', 'discarded', now() - interval '100 days', now() - interval '120 days'),
  -- discarded recently (kept)
  ('00000000-0000-4000-f000-0000000000a4', 'Pgtap Cuatro', 'pgtap.cuatro@ejemplo.test', null, null,
     '00000000-0000-4000-c000-000000000003', now() - interval '20 days', 'discarded', now() - interval '10 days', now() - interval '20 days'),
  -- new, 179 days (kept)
  ('00000000-0000-4000-f000-0000000000a5', 'Pgtap Cinco', 'pgtap.cinco@ejemplo.test', null, null,
     '00000000-0000-4000-c000-000000000003', now() - interval '179 days', 'new', null, now() - interval '179 days');
-- The seeded invited request becomes very old: retention must not touch it.
update public.access_requests set created_at = now() - interval '400 days' where id = '00000000-0000-4000-f000-000000000002';

-- No direct writes for API roles ------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ insert into public.access_requests (full_name, email, privacy_document_id, privacy_accepted_at) values ('Bot', 'bot@ejemplo.test', '00000000-0000-4000-c000-000000000003', now()) $$,
  '42501', null, 'anon cannot insert access requests'
);
reset role;

select pg_temp.auth_as('00000000-0000-4000-a000-000000000011', 'aal1');
set local role authenticated;
select throws_ok(
  $$ insert into public.access_requests (full_name, email, privacy_document_id, privacy_accepted_at) values ('X', 'x@ejemplo.test', '00000000-0000-4000-c000-000000000003', now()) $$,
  '42501', null, 'authenticated cannot insert access requests'
);
select is((select count(*)::int from public.access_requests), 0, 'a seller sees no access requests');
select throws_ok($$ select public.admin_discard_access_request('00000000-0000-4000-f000-0000000000a1') $$, '42501', null, 'seller cannot discard');
select throws_ok($$ select private.run_access_request_retention() $$, '42501', null, 'authenticated cannot run retention');
reset role;

select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal1');
set local role authenticated;
select throws_ok($$ select public.admin_discard_access_request('00000000-0000-4000-f000-0000000000a1') $$, '42501', null, 'superadmin aal1 cannot discard');
reset role;

-- Manual discard (superadmin aal2) -----------------------------------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;
select lives_ok($$ select public.admin_discard_access_request('00000000-0000-4000-f000-0000000000a1') $$, 'aal2 discards a new request');
select is(
  (select row(status::text, discarded_by_system, reviewed_by, discarded_at is not null, reviewed_at is not null)::text
     from public.access_requests where id = '00000000-0000-4000-f000-0000000000a1'),
  '(discarded,f,00000000-0000-4000-a000-000000000001,t,t)',
  'discarded with reviewer and dates'
);
select is(pg_temp.audits('access_request.discarded', '00000000-0000-4000-f000-0000000000a1', 'user'), 1, 'manual discard audited as user');
select is(
  (select data from public.audit_logs where action = 'access_request.discarded' and object_id = '00000000-0000-4000-f000-0000000000a1'),
  '{"automatic": false}'::jsonb,
  'audit data automatic=false'
);
select throws_ok($$ select public.admin_discard_access_request('00000000-0000-4000-f000-0000000000a1') $$, 'P0010', null, 'already discarded → P0010');
select throws_ok($$ select public.admin_discard_access_request('00000000-0000-4000-f000-000000000002') $$, 'P0010', null, 'invited → P0010');
select throws_ok($$ select public.admin_discard_access_request('00000000-0000-4000-f000-0000000000ff') $$, 'P0002', null, 'unknown → P0002');
reset role;

-- Retention (as the cron job runs it) -------------------------------------------------------------------
select is(
  private.run_access_request_retention(),
  '{"discarded": 1, "anonymized": 1}'::jsonb,
  'retention discards 1 and anonymizes 1'
);
select is(
  (select row(status::text, discarded_by_system)::text from public.access_requests where id = '00000000-0000-4000-f000-0000000000a2'),
  '(discarded,t)',
  'new > 180 days discarded by the system'
);
select is(pg_temp.audits('access_request.discarded', '00000000-0000-4000-f000-0000000000a2', 'system'), 1, 'automatic discard audited as system');
select is(
  (select data from public.audit_logs where action = 'access_request.discarded' and object_id = '00000000-0000-4000-f000-0000000000a2'),
  '{"automatic": true}'::jsonb,
  'audit data automatic=true'
);
select is(
  (select row(full_name, email, company_or_role, message, anonymized_at is not null)::text
     from public.access_requests where id = '00000000-0000-4000-f000-0000000000a3'),
  '(,,,,t)',
  'discarded > 90 days anonymized'
);
select is((select email from public.access_requests where id = '00000000-0000-4000-f000-0000000000a4'), 'pgtap.cuatro@ejemplo.test', 'recently discarded kept');
select is((select status::text from public.access_requests where id = '00000000-0000-4000-f000-0000000000a5'), 'new', 'new at 179 days kept');
select is(
  (select row(status::text, email)::text from public.access_requests where id = '00000000-0000-4000-f000-000000000002'),
  '(invited,invitacion.pendiente@ejemplo.test)',
  'invited request untouched'
);
select is(private.run_access_request_retention(), '{"discarded": 0, "anonymized": 0}'::jsonb, 'retention is idempotent');
select is((select count(*)::int from cron.job where jobname = 'access-request-retention' and schedule = '15 8 * * *'), 1, 'daily cron job at 08:15 UTC');

-- An anonymized request cannot be converted into an invitation -------------------------------------------
select pg_temp.auth_as('00000000-0000-4000-a000-000000000001', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select * from public.admin_create_invitation('pgtap.tres@ejemplo.test', 7, extensions.digest('pgtap-anon', 'sha256'), '00000000-0000-4000-f000-0000000000a3', gen_random_uuid()) $$,
  'P0010', null, 'anonymized request is not convertible'
);
select is(
  (select count(*)::int from public.invitations where access_request_id = '00000000-0000-4000-f000-0000000000a3'),
  0,
  'no invitation linked to the anonymized request'
);
reset role;

select * from finish();
rollback;
