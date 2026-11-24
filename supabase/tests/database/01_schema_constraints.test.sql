-- T023 — schema constraints and validation triggers (data-model.md)
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- organizations.slug pattern and length
select throws_ok(
  $$ insert into public.organizations (type, name, slug) values ('personal', 'X', 'Slug Inválido') $$,
  '23514', null, 'slug with spaces/uppercase is rejected'
);
select throws_ok(
  format($$ insert into public.organizations (type, name, slug) values ('personal', 'X', %L) $$, repeat('a', 61)),
  '23514', null, 'slug longer than 60 is rejected'
);

-- suspended_reason required and not only spaces when suspended
select throws_ok(
  $$ insert into public.organizations (type, name, slug, status, suspended_reason) values ('personal', 'X', 'x-susp', 'suspended', '   ') $$,
  '23514', null, 'suspending with a whitespace-only reason is rejected'
);
select throws_ok(
  $$ insert into public.organizations (type, name, slug, status) values ('personal', 'X', 'x-susp-2', 'suspended') $$,
  '23514', null, 'suspending without reason is rejected'
);

-- quotas.daily_limit <= monthly_limit
select throws_ok(
  $$ update public.quotas set daily_limit = 5, monthly_limit = 3 where organization_id = '00000000-0000-4000-b000-00000000000a' $$,
  '23514', null, 'daily limit greater than monthly is rejected'
);

-- invitations: not accepted and revoked at once
select throws_ok(
  $$ update public.invitations set revoked_at = now(), revoked_by = invited_by where id = '00000000-0000-4000-e000-000000000002' $$,
  '23514', null, 'an invitation cannot be accepted and revoked at the same time'
);

-- one open invitation per email (partial unique index)
select throws_ok(
  $$ insert into public.invitations (email, invited_by, token_hash, expires_at)
     values ('invitacion.pendiente@ejemplo.test', '00000000-0000-4000-a000-000000000001',
             extensions.digest('another-token', 'sha256'), now() + interval '7 days') $$,
  '23505', null, 'a second open invitation for the same email is rejected'
);

-- access_requests.anonymized_at ⇒ personal data null
select throws_ok(
  $$ update public.access_requests set anonymized_at = now() where id = '00000000-0000-4000-f000-000000000003' $$,
  '23514', null, 'anonymized request with personal data is rejected'
);

-- profiles.full_name not only spaces
select throws_ok(
  $$ update public.profiles set full_name = '   ' where user_id = '00000000-0000-4000-a000-000000000013' $$,
  '23514', null, 'whitespace-only full_name is rejected'
);

-- profiles.onboarding_step 1–3
select throws_ok(
  $$ update public.profiles set onboarding_step = 4 where user_id = '00000000-0000-4000-a000-000000000013' $$,
  '23514', null, 'onboarding_step outside 1–3 is rejected'
);

-- memberships trigger in personal organizations
select throws_ok(
  $$ update public.memberships set roles = '{vendedor,supervisor}' where user_id = '00000000-0000-4000-a000-000000000011' $$,
  '23514', null, 'personal organization membership only allows {vendedor}'
);
select throws_ok(
  $$ insert into public.memberships (organization_id, user_id, roles, status, joined_at)
     values ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000012', '{vendedor}', 'active', now()) $$,
  '23514', null, 'personal organization allows a single membership'
);

-- profiles.timezone validated against pg_timezone_names
select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus' where user_id = '00000000-0000-4000-a000-000000000013' $$,
  '23514', null, 'invalid profile timezone is rejected'
);
select lives_ok(
  $$ update public.profiles set timezone = 'America/Bogota' where user_id = '00000000-0000-4000-a000-000000000013' $$,
  'valid profile timezone is accepted'
);

-- profiles.full_name never back to NULL
select throws_ok(
  $$ update public.profiles set full_name = null where user_id = '00000000-0000-4000-a000-000000000013' $$,
  '23514', null, 'full_name cannot go back to NULL'
);

-- onboarding_updated_at is set only when onboarding columns change
update public.profiles set onboarding_updated_at = null where user_id = '00000000-0000-4000-a000-000000000013';
update public.profiles set timezone = 'America/Lima' where user_id = '00000000-0000-4000-a000-000000000013';
select is(
  (select onboarding_updated_at from public.profiles where user_id = '00000000-0000-4000-a000-000000000013'),
  null::timestamptz,
  'an unrelated update does not touch onboarding_updated_at'
);
update public.profiles set onboarding_step = 2 where user_id = '00000000-0000-4000-a000-000000000013';
select isnt(
  (select onboarding_updated_at from public.profiles where user_id = '00000000-0000-4000-a000-000000000013'),
  null::timestamptz,
  'changing onboarding_step sets onboarding_updated_at'
);
update public.profiles set onboarding_updated_at = null where user_id = '00000000-0000-4000-a000-000000000013';
update public.profiles set onboarding_status = 'in_progress' where user_id = '00000000-0000-4000-a000-000000000013';
select isnt(
  (select onboarding_updated_at from public.profiles where user_id = '00000000-0000-4000-a000-000000000013'),
  null::timestamptz,
  'changing onboarding_status sets onboarding_updated_at'
);

select * from finish();
rollback;
