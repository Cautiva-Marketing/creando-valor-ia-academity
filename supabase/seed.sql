-- Development / CI seed (data-model.md → "Seed de desarrollo"). NEVER run against staging/production.
-- Every credential, the TOTP secret and the invitation tokens are documented in
-- tests/e2e/fixtures/seed-data.ts. E2E tests treat this data as READ-ONLY (tasks.md → Path Conventions).

-- Helper: create a confirmed email/password user (profile row is created by the auth trigger) --------
create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_password text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id::text, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );
end;
$$;

-- Legal documents 0.1-borrador (already effective, drafts) --------------------------------------------
insert into public.legal_documents (id, kind, version, effective_at, is_draft, content_path) values
  ('00000000-0000-4000-c000-000000000001', 'terms', '0.1-borrador', '2026-01-01T00:00:00Z', true, 'content/legal/terminos-0.1-borrador.md'),
  ('00000000-0000-4000-c000-000000000002', 'ai_notice', '0.1-borrador', '2026-01-01T00:00:00Z', true, 'content/legal/aviso-ia-0.1-borrador.md'),
  ('00000000-0000-4000-c000-000000000003', 'privacy', '0.1-borrador', '2026-01-01T00:00:00Z', true, 'content/legal/privacidad-0.1-borrador.md');

-- Users -------------------------------------------------------------------------------------------------
select pg_temp.seed_user('00000000-0000-4000-a000-000000000001', 'superadmin@ejemplo.test', 'Semilla-Segura-2026');
select pg_temp.seed_user('00000000-0000-4000-a000-000000000002', 'superadmin.sinfactor@ejemplo.test', 'Semilla-Segura-2026');
select pg_temp.seed_user('00000000-0000-4000-a000-000000000011', 'vendedor.a@ejemplo.test', 'Semilla-Segura-2026');
select pg_temp.seed_user('00000000-0000-4000-a000-000000000012', 'vendedor.b@ejemplo.test', 'Semilla-Segura-2026');
select pg_temp.seed_user('00000000-0000-4000-a000-000000000013', 'vendedor.c@ejemplo.test', 'Semilla-Segura-2026');
select pg_temp.seed_user('00000000-0000-4000-a000-000000000014', 'vendedor.d@ejemplo.test', 'Semilla-Segura-2026');
select pg_temp.seed_user('00000000-0000-4000-a000-000000000015', 'vendedor.e@ejemplo.test', 'Semilla-Segura-2026');

-- Superadmins (one with a verified TOTP factor of known secret, one without factor) -----------------------
insert into public.platform_admins (user_id, created_by_label) values
  ('00000000-0000-4000-a000-000000000001', 'seed'),
  ('00000000-0000-4000-a000-000000000002', 'seed');

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (
  '00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000001', 'seed-totp',
  'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
);

update public.profiles set full_name = 'Sofía Superadmin', onboarding_status = 'completed'
 where user_id = '00000000-0000-4000-a000-000000000001';
update public.profiles set full_name = 'Samuel Sin Factor', onboarding_status = 'completed'
 where user_id = '00000000-0000-4000-a000-000000000002';

-- Personal organizations A–E ---------------------------------------------------------------------------
insert into public.organizations (id, type, name, slug, timezone, status, suspended_reason, suspended_at, suspended_by) values
  ('00000000-0000-4000-b000-00000000000a', 'personal', 'Ana Vendedora', 'ana-vendedora', 'America/Lima', 'active', null, null, null),
  ('00000000-0000-4000-b000-00000000000b', 'personal', 'Bruno Vendedor', 'bruno-vendedor', 'America/Lima', 'active', null, null, null),
  ('00000000-0000-4000-b000-00000000000c', 'personal', 'Carla Vendedora', 'carla-vendedora', 'America/Lima', 'active', null, null, null),
  ('00000000-0000-4000-b000-00000000000d', 'personal', 'Diego Vendedor', 'diego-vendedor', 'America/Lima', 'suspended',
     'Suspensión de prueba (seed)', now() - interval '1 day', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-b000-00000000000e', 'personal', 'Elena Vendedora', 'elena-vendedora', 'America/Lima', 'active', null, null, null);

update public.profiles set full_name = 'Ana Vendedora', onboarding_status = 'completed', onboarding_step = 3
 where user_id = '00000000-0000-4000-a000-000000000011';
update public.profiles set full_name = 'Bruno Vendedor', onboarding_status = 'completed', onboarding_step = 3
 where user_id = '00000000-0000-4000-a000-000000000012';
update public.profiles set full_name = 'Carla Vendedora', onboarding_status = 'pending', onboarding_step = 1
 where user_id = '00000000-0000-4000-a000-000000000013';
update public.profiles set full_name = 'Diego Vendedor', onboarding_status = 'completed', onboarding_step = 3
 where user_id = '00000000-0000-4000-a000-000000000014';
update public.profiles set full_name = 'Elena Vendedora', onboarding_status = 'completed', onboarding_step = 3
 where user_id = '00000000-0000-4000-a000-000000000015';

insert into public.memberships (organization_id, user_id, roles, status, invited_at, joined_at) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', '{vendedor}', 'active', now() - interval '20 days', now() - interval '19 days'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-000000000012', '{vendedor}', 'active', now() - interval '20 days', now() - interval '19 days'),
  ('00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', '{vendedor}', 'active', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-a000-000000000014', '{vendedor}', 'active', now() - interval '20 days', now() - interval '19 days'),
  ('00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-a000-000000000015', '{vendedor}', 'suspended', now() - interval '20 days', now() - interval '19 days');

insert into public.quotas (organization_id) values
  ('00000000-0000-4000-b000-00000000000a'),
  ('00000000-0000-4000-b000-00000000000b'),
  ('00000000-0000-4000-b000-00000000000c'),
  ('00000000-0000-4000-b000-00000000000d'),
  ('00000000-0000-4000-b000-00000000000e');

insert into public.teams (organization_id, name) values
  ('00000000-0000-4000-b000-00000000000a', 'Equipo A'),
  ('00000000-0000-4000-b000-00000000000b', 'Equipo B');

-- AI usage for A and B: current month (today) and previous month ---------------------------------------
insert into public.ai_usage (organization_id, user_id, task, model, simulation_id, input_tokens, output_tokens, latency_ms, estimated_cost_usd, created_at) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'buyer', 'gemini-seed', '00000000-0000-4000-9000-000000000a01', 1200, 400, 900, 0.001200, now() - interval '5 minutes'),
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'evaluator', 'gemini-seed', '00000000-0000-4000-9000-000000000a01', 2000, 600, 1500, 0.002000, now() - interval '4 minutes'),
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'buyer', 'gemini-seed', '00000000-0000-4000-9000-000000000a02', 800, 300, 700, 0.000800, date_trunc('month', now()) - interval '10 days'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-000000000012', 'tutor', 'gemini-seed', '00000000-0000-4000-9000-000000000b01', 1500, 500, 1100, 0.001500, now() - interval '3 minutes'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-000000000012', 'buyer', 'gemini-seed', '00000000-0000-4000-9000-000000000b02', 900, 350, 800, 0.000900, date_trunc('month', now()) - interval '12 days');

-- Invitations: one per state (token_hash = sha256(known token), see seed-data.ts) ----------------------
insert into public.invitations (id, email, invited_by, token_hash, expires_in_days, expires_at, last_sent_at, send_status, send_attempts, accepted_at, accepted_user_id, revoked_at, revoked_by, created_at) values
  ('00000000-0000-4000-e000-000000000001', 'invitacion.pendiente@ejemplo.test', '00000000-0000-4000-a000-000000000001',
     extensions.digest('seed-pending-token-aaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'), 7, now() + interval '7 days', now(), 'sent', 1, null, null, null, null, now()),
  ('00000000-0000-4000-e000-000000000002', 'vendedor.a@ejemplo.test', '00000000-0000-4000-a000-000000000001',
     extensions.digest('seed-accepted-token-aaaaaaaaaaaaaaaaaaaaaaa', 'sha256'), 7, now() - interval '13 days', now() - interval '20 days', 'sent', 1, now() - interval '19 days', '00000000-0000-4000-a000-000000000011', null, null, now() - interval '20 days'),
  ('00000000-0000-4000-e000-000000000003', 'invitacion.vencida@ejemplo.test', '00000000-0000-4000-a000-000000000001',
     extensions.digest('seed-expired-token-aaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'), 1, now() - interval '1 day', now() - interval '2 days', 'sent', 1, null, null, null, null, now() - interval '2 days'),
  ('00000000-0000-4000-e000-000000000004', 'invitacion.revocada@ejemplo.test', '00000000-0000-4000-a000-000000000001',
     extensions.digest('seed-revoked-token-aaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'), 7, now() + interval '5 days', now() - interval '2 days', 'sent', 1, null, null, now() - interval '1 day', '00000000-0000-4000-a000-000000000001', now() - interval '2 days');

-- Access requests in the three states ---------------------------------------------------------------
insert into public.access_requests (id, full_name, email, company_or_role, message, privacy_document_id, privacy_accepted_at, status, invitation_id, reviewed_by, reviewed_at, discarded_at, created_at) values
  ('00000000-0000-4000-f000-000000000001', 'Nadia Nueva', 'solicitud.nueva@ejemplo.test', 'Inmobiliaria Sur', 'Quiero practicar mis cierres.',
     '00000000-0000-4000-c000-000000000003', now() - interval '3 days', 'new', null, null, null, null, now() - interval '3 days'),
  ('00000000-0000-4000-f000-000000000002', 'Iván Invitado', 'invitacion.pendiente@ejemplo.test', 'Vendedor independiente', null,
     '00000000-0000-4000-c000-000000000003', now() - interval '4 days', 'invited', '00000000-0000-4000-e000-000000000001',
     '00000000-0000-4000-a000-000000000001', now() - interval '1 day', null, now() - interval '4 days'),
  ('00000000-0000-4000-f000-000000000003', 'Daniela Descartada', 'solicitud.descartada@ejemplo.test', null, null,
     '00000000-0000-4000-c000-000000000003', now() - interval '10 days', 'discarded', null,
     '00000000-0000-4000-a000-000000000001', now() - interval '5 days', now() - interval '5 days', now() - interval '10 days');

update public.invitations set access_request_id = '00000000-0000-4000-f000-000000000002'
 where id = '00000000-0000-4000-e000-000000000001';
