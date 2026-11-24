-- T100 — accept_invitation (data-model.md "Operaciones atómicas clave", FR-011/012/015/016).
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

create function pg_temp.new_user(p_id uuid, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '',
    now(), '{}', '{}', now(), now())
$$;

create function pg_temp.h(p text) returns bytea language sql as $$ select extensions.digest(p, 'sha256') $$;

create function pg_temp.new_inv(
  p_id uuid, p_email text, p_token text,
  p_expires timestamptz default now() + interval '7 days',
  p_accepted boolean default false, p_revoked boolean default false,
  p_target uuid default null, p_request uuid default null
) returns void language sql as $$
  insert into public.invitations (id, email, invited_by, token_hash, expires_in_days, expires_at,
    accepted_at, accepted_user_id, revoked_at, revoked_by, target_organization_id, access_request_id)
  values (p_id, p_email, '00000000-0000-4000-a000-000000000001', pg_temp.h(p_token), 7, p_expires,
    case when p_accepted then now() end, null,
    case when p_revoked then now() end, case when p_revoked then '00000000-0000-4000-a000-000000000001'::uuid end,
    p_target, p_request)
$$;

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

create function pg_temp.accept(p_token text, p_user uuid, p_name text,
  p_terms uuid default '00000000-0000-4000-c000-000000000001',
  p_ai uuid default '00000000-0000-4000-c000-000000000002') returns jsonb language sql as $$
  select public.accept_invitation(pg_temp.h(p_token), p_user, p_name, p_terms, p_ai)
$$;

grant execute on all functions in schema pg_temp to service_role, authenticated, anon;

-- Fixtures ---------------------------------------------------------------------------------------------
select pg_temp.new_user('00000000-0000-4000-b000-000000000101', 'nandu@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000102', 'nandu.dos@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000103', 'largo@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000104', 'fallo@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000105', 'desdesolicitud@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000106', 'empresa@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000107', 'legal@ejemplo.test');
select pg_temp.new_user('00000000-0000-4000-b000-000000000108', 'otro.correo@ejemplo.test');

select pg_temp.new_inv('00000000-0000-4000-e000-000000000101', 'nandu@ejemplo.test', 'tok-nandu');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000102', 'nandu.dos@ejemplo.test', 'tok-nandu-2');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000103', 'largo@ejemplo.test', 'tok-largo');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000104', 'fallo@ejemplo.test', 'tok-fallo');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000106', 'empresa@ejemplo.test', 'tok-empresa');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000107', 'legal@ejemplo.test', 'tok-legal');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000108', 'vencida.nueva@ejemplo.test', 'tok-vencida', now() - interval '1 second');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000109', 'revocada.nueva@ejemplo.test', 'tok-revocada', p_revoked => true);
select pg_temp.new_inv('00000000-0000-4000-e000-000000000110', 'vendedor.b@ejemplo.test', 'tok-con-pertenencia');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000111', 'superadmin.sinfactor@ejemplo.test', 'tok-superadmin');

insert into public.access_requests (id, full_name, email, privacy_document_id, privacy_accepted_at, status)
values ('00000000-0000-4000-f000-000000000101', 'Desde Solicitud', 'desdesolicitud@ejemplo.test',
  '00000000-0000-4000-c000-000000000003', now(), 'new');
select pg_temp.new_inv('00000000-0000-4000-e000-000000000105', 'desdesolicitud@ejemplo.test', 'tok-solicitud',
  p_request => '00000000-0000-4000-f000-000000000101');

insert into public.organizations (id, type, name, slug, status, suspended_reason, suspended_at)
values ('00000000-0000-4000-d000-000000000101', 'empresa', 'Empresa Suspendida', 'empresa-suspendida-pgtap',
  'suspended', 'Prueba', now());
update public.invitations set target_organization_id = '00000000-0000-4000-d000-000000000101'
 where id = '00000000-0000-4000-e000-000000000106';

-- slugify -----------------------------------------------------------------------------------------------
select is(private.slugify('Ñandú Pérez'), 'nandu-perez', 'slugify removes accents and spaces');
select is(private.slugify('  ¡¡Hola!!  Mundo  '), 'hola-mundo', 'slugify collapses separators');
select is(private.slugify('!!!'), 'org', 'slugify falls back to org');
select ok(char_length(private.slugify(repeat('Árbol ', 20))) <= 55, 'slugify base ≤ 55');
select ok(private.slugify(repeat('ab ', 30)) !~ '-$', 'slugify never ends with a dash after truncation');

-- Permissions -------------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$ select pg_temp.accept('tok-nandu', '00000000-0000-4000-b000-000000000101', 'Ñandú Pérez') $$,
  '42501', null, 'authenticated cannot execute accept_invitation');
reset role;
set local role anon;
select throws_ok($$ select pg_temp.accept('tok-nandu', '00000000-0000-4000-b000-000000000101', 'Ñandú Pérez') $$,
  '42501', null, 'anon cannot execute accept_invitation');
reset role;

-- Happy path --------------------------------------------------------------------------------------------
set local role service_role;
create temp table r1 on commit drop as
  select pg_temp.accept('tok-nandu', '00000000-0000-4000-b000-000000000101', '  Ñandú Pgtap Único ') as res;
reset role;

select ok((select res ? 'organization_id' and res ? 'membership_id' from r1), 'returns organization_id and membership_id');
select is(
  (select row(type::text, status::text, timezone, name, slug)::text from public.organizations
    where id = (select (res ->> 'organization_id')::uuid from r1)),
  row('personal', 'active', 'America/Lima', 'Ñandú Pgtap Único', 'nandu-pgtap-unico')::text,
  'personal org: active, America/Lima, name = full_name, slug nandu-pgtap-unico'
);
select is(
  (select row(roles::text, status::text, invited_at is not null, joined_at is not null, organization_id)::text
     from public.memberships where id = (select (res ->> 'membership_id')::uuid from r1)),
  row('{vendedor}', 'active', true, true, (select (res ->> 'organization_id')::uuid from r1))::text,
  'membership {vendedor}, active, invited_at/joined_at'
);
select is(
  (select row(daily_limit, monthly_limit)::text from public.quotas
    where organization_id = (select (res ->> 'organization_id')::uuid from r1)),
  row(10, 100)::text, 'quota 10/100'
);
select set_eq(
  $$ select document_id from public.legal_acceptances where user_id = '00000000-0000-4000-b000-000000000101' $$,
  $$ values ('00000000-0000-4000-c000-000000000001'::uuid), ('00000000-0000-4000-c000-000000000002'::uuid) $$,
  'two legal acceptances referencing exactly the received documents'
);
select is((select full_name from public.profiles where user_id = '00000000-0000-4000-b000-000000000101'),
  'Ñandú Pgtap Único', 'profile full_name updated (trimmed)');
select ok(
  (select accepted_at is not null and accepted_user_id = '00000000-0000-4000-b000-000000000101'
     from public.invitations where id = '00000000-0000-4000-e000-000000000101'),
  'invitation marked accepted'
);
select is(
  (select count(*)::int from public.audit_logs
    where action = 'invitation.accepted' and object_id = '00000000-0000-4000-e000-000000000101'),
  1, 'exactly one invitation.accepted'
);
select is(
  (select organization_id from public.audit_logs
    where action = 'invitation.accepted' and object_id = '00000000-0000-4000-e000-000000000101'),
  (select (res ->> 'organization_id')::uuid from r1), 'audit carries the new organization'
);

-- Second call → used ------------------------------------------------------------------------------------
set local role service_role;
select throws_ok($$ select pg_temp.accept('tok-nandu', '00000000-0000-4000-b000-000000000101', 'Ñandú Pérez') $$,
  'P0011', null, 'second acceptance → P0011');
reset role;
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-nandu', '00000000-0000-4000-b000-000000000101', 'Ñandú Pérez') $$),
  'used', 'DETAIL used');
select is((select count(*)::int from public.memberships where user_id = '00000000-0000-4000-b000-000000000101'),
  1, 'still a single membership');

-- Slug collision and length -----------------------------------------------------------------------------
select pg_temp.accept('tok-nandu-2', '00000000-0000-4000-b000-000000000102', 'Ñandú Pgtap Único');
select matches(
  (select o.slug from public.organizations o join public.memberships m on m.organization_id = o.id
    where m.user_id = '00000000-0000-4000-b000-000000000102'),
  '^nandu-pgtap-unico-[a-z0-9]{4}$', 'slug collision → 4-character suffix'
);
select pg_temp.accept('tok-largo', '00000000-0000-4000-b000-000000000103', rpad('Bárbara ', 80, 'x'));
select ok(
  (select char_length(o.slug) <= 60 from public.organizations o join public.memberships m on m.organization_id = o.id
    where m.user_id = '00000000-0000-4000-b000-000000000103'),
  'slug length ≤ 60'
);

-- Unusable invitations ----------------------------------------------------------------------------------
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-vencida', '00000000-0000-4000-b000-000000000108', 'X') $$),
  'expired', 'expired → DETAIL expired');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-revocada', '00000000-0000-4000-b000-000000000108', 'X') $$),
  'revoked', 'revoked → DETAIL revoked');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-no-existe', '00000000-0000-4000-b000-000000000108', 'X') $$),
  'invalid', 'unknown token → DETAIL invalid');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-empresa', '00000000-0000-4000-b000-000000000106', 'X') $$),
  'organization_suspended', 'target organization suspended → DETAIL organization_suspended');

-- User checks -------------------------------------------------------------------------------------------
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-legal', '00000000-0000-4000-b000-000000000108', 'X') $$),
  'invalid', 'user with a different email → invalid');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-con-pertenencia', '00000000-0000-4000-a000-000000000012', 'X') $$),
  'invalid', 'user with memberships → invalid');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-superadmin', '00000000-0000-4000-a000-000000000002', 'X') $$),
  'invalid', 'superadmin user → invalid');
select is(
  (select accepted_at from public.invitations where id = '00000000-0000-4000-e000-000000000107'),
  null, 'rejected attempts leave the invitation pending'
);

-- Access request of origin ------------------------------------------------------------------------------
update public.access_requests set status = 'new', invitation_id = null where id = '00000000-0000-4000-f000-000000000101';
select pg_temp.accept('tok-solicitud', '00000000-0000-4000-b000-000000000105', 'Desde Solicitud');
select is(
  (select row(status::text, invitation_id)::text from public.access_requests where id = '00000000-0000-4000-f000-000000000101'),
  row('invited', '00000000-0000-4000-e000-000000000105'::uuid)::text,
  'origin access request marked invited with the invitation'
);

-- Intermediate failure leaves nothing -------------------------------------------------------------------
create function pg_temp.fail_quota() returns trigger language plpgsql as $$
begin
  raise exception 'simulated failure';
end;
$$;
create trigger pgtap_fail_quota before insert on public.quotas for each row execute function pg_temp.fail_quota();
select throws_ok($$ select pg_temp.accept('tok-fallo', '00000000-0000-4000-b000-000000000104', 'Fallo Intermedio') $$,
  'P0001', 'simulated failure', 'failure after creating the org propagates');
drop trigger pgtap_fail_quota on public.quotas;
select is((select count(*)::int from public.organizations where name = 'Fallo Intermedio'), 0, 'no organization left behind');
select is((select count(*)::int from public.memberships where user_id = '00000000-0000-4000-b000-000000000104'), 0, 'no membership left behind');
select is((select count(*)::int from public.legal_acceptances where user_id = '00000000-0000-4000-b000-000000000104'), 0, 'no legal acceptances left behind');
select is((select accepted_at from public.invitations where id = '00000000-0000-4000-e000-000000000104'), null, 'invitation still pending');
select is((select full_name from public.profiles where user_id = '00000000-0000-4000-b000-000000000104'), null, 'profile name not changed');

-- Legal versions (FR-015) -------------------------------------------------------------------------------
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-legal', '00000000-0000-4000-b000-000000000107', 'Legal',
  '00000000-0000-4000-c000-000000000003') $$), 'legal_outdated', 'document of another kind → legal_outdated');
insert into public.legal_documents (id, kind, version, effective_at, is_draft, content_path)
values ('00000000-0000-4000-c000-000000000101', 'terms', '0.0-antigua', '2025-06-01T00:00:00Z', true, 'content/legal/terminos-0.1-borrador.md');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-legal', '00000000-0000-4000-b000-000000000107', 'Legal',
  '00000000-0000-4000-c000-000000000101') $$), 'legal_outdated', 'previous version → legal_outdated');
insert into public.legal_documents (id, kind, version, effective_at, is_draft, content_path)
values ('00000000-0000-4000-c000-000000000102', 'terms', '0.2-pgtap', now() - interval '1 minute', true, 'content/legal/terminos-0.1-borrador.md');
select is(pg_temp.detail_of($$ select pg_temp.accept('tok-legal', '00000000-0000-4000-b000-000000000107', 'Legal') $$),
  'legal_outdated', 'a newer version was published → legal_outdated');
select is((select count(*)::int from public.memberships where user_id = '00000000-0000-4000-b000-000000000107'), 0,
  'legal_outdated creates nothing');
select lives_ok($$ select pg_temp.accept('tok-legal', '00000000-0000-4000-b000-000000000107', 'Legal',
  '00000000-0000-4000-c000-000000000102') $$, 'the new current version is accepted');
select set_eq(
  $$ select document_id from public.legal_acceptances where user_id = '00000000-0000-4000-b000-000000000107' $$,
  $$ values ('00000000-0000-4000-c000-000000000102'::uuid), ('00000000-0000-4000-c000-000000000002'::uuid) $$,
  'acceptances reference the new version'
);

select * from finish();
rollback;
