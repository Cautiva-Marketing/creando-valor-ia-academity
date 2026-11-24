-- T026 — audit_logs is append-only (even for service_role) and write_audit validates the catalog.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select lives_ok(
  $$ select private.write_audit('operator', null, 'pgtap', null, 'superadmin.mfa_reset', 'user',
       '00000000-0000-4000-a000-000000000001', '{"sessions_revoked": 2}'::jsonb) $$,
  'write_audit accepts a catalog action with allowed keys'
);

select throws_ok($$ update public.audit_logs set action = 'tampered' $$, '42501', null, 'UPDATE of audit_logs raises');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'DELETE of audit_logs raises');

set local role service_role;
select throws_ok($$ update public.audit_logs set action = 'tampered' $$, '42501', null, 'UPDATE raises even for service_role');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'DELETE raises even for service_role');
reset role;

set local role authenticated;
select throws_ok(
  $$ insert into public.audit_logs (actor_type, action, object_type) values ('user', 'invitation.created', 'invitation') $$,
  '42501', null, 'authenticated cannot insert into audit_logs'
);
reset role;

select throws_ok(
  $$ select private.write_audit('user', null, null, null, 'not.in.catalog', 'x', null, '{}'::jsonb) $$,
  '22023', null, 'write_audit rejects actions outside the catalog'
);
select throws_ok(
  $$ select private.write_audit('user', null, null, null, 'invitation.created', 'invitation', null,
       '{"email": "persona@ejemplo.test"}'::jsonb) $$,
  '22023', null, 'write_audit rejects data keys outside the whitelist'
);

select ok(
  not has_function_privilege('authenticated',
    'public.write_audit(public.audit_actor_type, uuid, text, uuid, text, text, text, jsonb, public.audit_result)',
    'execute')
  and has_function_privilege('service_role',
    'public.write_audit(public.audit_actor_type, uuid, text, uuid, text, text, text, jsonb, public.audit_result)',
    'execute'),
  'public.write_audit is executable only by service_role'
);

select * from finish();
rollback;
