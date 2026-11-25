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

-- =====================================================================================================
-- 002 · Seller practice (data-model.md → "Seed de desarrollo"). Fixed ids exported in
-- tests/e2e/fixtures/seed-data.ts (SEED_PRACTICE). READ-ONLY for e2e; mutating tests use factories.
--   Per seller L ∈ {a, b}:
--     products   9100-…L01 real estate (2 versions, Sunarp facts) · L02 hardware (no differentiators)
--                · L03 cooperative (archived)
--     sessions   9000-…L01 evaluated (latest, with flag, reveals, one no_evaluable criterion)
--                · L02 finalized/failed (2 manual retries used) · L03 finalized/not_applicable
--                · L04 evaluated (older, lower score → upward trend on "Hoy")
--   Seller C has no products (guided empty state).
-- =====================================================================================================

-- Messages helper: rows given as jsonb objects (seller rows get a client_message_id).
create or replace function pg_temp.seed_messages(p_session uuid, p_org uuid, p_user uuid, p_start timestamptz, p_rows jsonb)
returns void
language plpgsql
as $$
declare
  v_row jsonb;
  v_seq int := 0;
begin
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_seq := v_seq + 1;
    insert into public.practice_messages (
      organization_id, user_id, session_id, seq, author, content, client_message_id, reply_to_seq,
      interest_before, interest_after, interest_delta, revealed_keys, hidden_objection_raised,
      seller_abusive, ends_session, meta_status, created_at
    ) values (
      p_org, p_user, p_session, v_seq, (v_row ->> 'author')::public.message_author, v_row ->> 'content',
      case when v_row ->> 'author' = 'seller' then gen_random_uuid() end,
      case when v_row ->> 'author' = 'buyer' and v_seq > 1 then v_seq - 1 end,
      (v_row ->> 'before')::smallint, (v_row ->> 'after')::smallint, (v_row ->> 'delta')::smallint,
      coalesce(array(select jsonb_array_elements_text(v_row -> 'revealed')), '{}'),
      v_row ->> 'hidden',
      case when v_row ->> 'author' = 'buyer' then coalesce((v_row ->> 'abusive')::boolean, false) end,
      coalesce((v_row ->> 'ends')::boolean, false),
      case when v_row ->> 'author' = 'buyer' then 'valid'::public.turn_meta_status end,
      p_start + make_interval(secs => v_seq * 40)
    );
  end loop;
end;
$$;

do $$
declare
  v_seller record;
  v_org uuid;
  v_user uuid;
  v_rubric uuid := '00000000-0000-4000-8000-0000000000a1';
  v_p_re uuid; v_p_hw uuid; v_p_ar uuid;
  v_v_re1 uuid; v_v_re2 uuid; v_v_hw uuid; v_v_ar uuid;
  v_o_re1 uuid; v_o_re2 uuid; v_o_re3 uuid; v_o_hw1 uuid; v_o_hw2 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
  v_e1 uuid; v_e4 uuid;
  v_t1 timestamptz; v_t2 timestamptz; v_t3 timestamptz; v_t4 timestamptz;
  v_id text;
begin
  for v_seller in
    select * from (values
      ('a', '00000000-0000-4000-b000-00000000000a'::uuid, '00000000-0000-4000-a000-000000000011'::uuid),
      ('b', '00000000-0000-4000-b000-00000000000b'::uuid, '00000000-0000-4000-a000-000000000012'::uuid)
    ) as t(l, org, usr)
  loop
    v_org := v_seller.org; v_user := v_seller.usr;
    -- Ids: 00000000-0000-4000-<group>-000000000<L><nn>, e.g. 9000-000000000a01.
    v_id := '00000000-0000-4000-%s-000000000' || v_seller.l || '%s';
    v_p_re := format(v_id, '9100', '01')::uuid;  v_p_hw := format(v_id, '9100', '02')::uuid;
    v_p_ar := format(v_id, '9100', '03')::uuid;
    v_v_re1 := format(v_id, '9200', '11')::uuid; v_v_re2 := format(v_id, '9200', '12')::uuid;
    v_v_hw := format(v_id, '9200', '21')::uuid;  v_v_ar := format(v_id, '9200', '31')::uuid;
    v_o_re1 := format(v_id, '9300', '11')::uuid; v_o_re2 := format(v_id, '9300', '12')::uuid;
    v_o_re3 := format(v_id, '9300', '13')::uuid; v_o_hw1 := format(v_id, '9300', '21')::uuid;
    v_o_hw2 := format(v_id, '9300', '22')::uuid;
    v_s1 := format(v_id, '9000', '01')::uuid; v_s2 := format(v_id, '9000', '02')::uuid;
    v_s3 := format(v_id, '9000', '03')::uuid; v_s4 := format(v_id, '9000', '04')::uuid;
    v_e1 := format(v_id, '9400', '01')::uuid; v_e4 := format(v_id, '9400', '04')::uuid;
    v_t1 := now() - interval '1 day';
    v_t2 := now() - interval '2 days';
    v_t3 := now() - interval '3 days';
    v_t4 := now() - interval '6 days';

    -- Products -----------------------------------------------------------------------------------------
    insert into public.products (id, organization_id, created_by, status, current_version, current_name, archived_at, created_at, updated_at) values
      (v_p_re, v_org, v_user, 'active', 2, 'Lote en Lurín – Etapa 1', null, now() - interval '10 days', now() - interval '8 days'),
      (v_p_hw, v_org, v_user, 'active', 1, 'Kit de herramientas Pro', null, now() - interval '9 days', now() - interval '9 days'),
      (v_p_ar, v_org, v_user, 'archived', 1, 'Cuenta de ahorro Cooperativa', now() - interval '5 days', now() - interval '9 days', now() - interval '5 days');

    insert into public.product_versions (id, organization_id, product_id, version, sector, name, description, price_kind, price_min, price_max, benefits, differentiators, verifiable_facts, created_by, created_at) values
      (v_v_re1, v_org, v_p_re, 1, 'real_estate', 'Lote en Lurín – Etapa 1',
       'Lotes de 120 m² en una urbanización con habilitación urbana, a 10 minutos de la Panamericana Sur.',
       'range', 45000, 60000,
       array['Saneamiento físico legal completo', 'A 10 minutos de la Panamericana Sur'],
       array['Financiamiento directo hasta 24 meses'],
       array['Partida registral inscrita en Sunarp', 'Habilitación urbana aprobada por la municipalidad'],
       v_user, now() - interval '10 days'),
      (v_v_re2, v_org, v_p_re, 2, 'real_estate', 'Lote en Lurín – Etapa 1',
       'Lotes de 120 m² en una urbanización con habilitación urbana, a 10 minutos de la Panamericana Sur. Incluye parque central.',
       'range', 48000, 60000,
       array['Saneamiento físico legal completo', 'A 10 minutos de la Panamericana Sur', 'Parque central de 2 000 m²'],
       array['Financiamiento directo hasta 24 meses'],
       array['Partida registral inscrita en Sunarp', 'Habilitación urbana aprobada por la municipalidad'],
       v_user, now() - interval '8 days'),
      (v_v_hw, v_org, v_p_hw, 1, 'hardware', 'Kit de herramientas Pro',
       'Maletín con 120 piezas para mantenimiento del hogar.', 'fixed', 350, 350,
       array['Garantía de un año'], '{}', '{}', v_user, now() - interval '9 days'),
      (v_v_ar, v_org, v_p_ar, 1, 'cooperative', 'Cuenta de ahorro Cooperativa',
       'Cuenta de ahorro para socios.', 'fixed', 0, 0,
       array['Sin costo de mantenimiento'], '{}', '{}', v_user, now() - interval '9 days');

    insert into public.objections (id, organization_id, product_id, text, category, created_at) values
      (v_o_re1, v_org, v_p_re, 'Me queda muy lejos de Lima.', 'logistics', now() - interval '10 days'),
      (v_o_re2, v_org, v_p_re, 'Está caro para lo que ofrece.', 'price', now() - interval '10 days'),
      (v_o_re3, v_org, v_p_re, 'No sé si la documentación está en regla.', 'trust', now() - interval '10 days'),
      (v_o_hw1, v_org, v_p_hw, 'En el mercado lo encuentro más barato.', 'competition', now() - interval '9 days'),
      (v_o_hw2, v_org, v_p_hw, 'Tengo que consultarlo con mi socio.', 'decision_maker', now() - interval '9 days');

    -- Session 1: evaluated (latest) -----------------------------------------------------------------------
    insert into public.practice_sessions (
      id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
      hints_enabled, focus_stage, selected_objection_ids, visible_objection, visible_objection_category,
      interest, last_interest_delta, seller_message_count, last_seq, hints_used, end_reason,
      setup_idempotency_key, configured_at, configured_expires_at, started_at, deadline_at, ended_at,
      buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model
    ) values (
      v_s1, v_org, v_user, v_p_re, v_v_re2, 2, 'evaluated', 3, true, null, array[v_o_re1],
      'Me queda muy lejos de Lima.', 'logistics', 82, 8, 4, 9, 1, 'goal_achieved',
      gen_random_uuid(), v_t1 - interval '5 minutes', v_t1 + interval '1 day', v_t1, v_t1 + interval '20 minutes', v_t1 + interval '7 minutes',
      'buyer-setup@1.0.0', 'buyer@1.0.0', 'gemini-seed', 'gemini-seed'
    );
    insert into public.practice_buyer_profiles (session_id, organization_id, user_id, name, age, occupation, intro, goal, revealable_labels)
    values (v_s1, v_org, v_user, 'Rosa Quispe', 42, 'Contadora independiente',
      'Busca un lote para invertir pensando en el futuro de sus hijos; compara opciones en el sur de Lima.',
      'Agendar una visita al lote', '{budget,timeline,decision_maker}');
    insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables, hidden_objections, opening_message)
    values (v_s1, v_org, v_user,
      'Quiere asegurar un patrimonio para sus hijos sin arriesgar sus ahorros.',
      'Prudente y analítica; desconfía de las promesas sin documentos.',
      jsonb_build_array(
        jsonb_build_object('key', 'budget', 'value', 'S/ 45 000 – S/ 50 000', 'budget_min', 45000, 'budget_max', 50000),
        jsonb_build_object('key', 'timeline', 'value', 'Antes de fin de año'),
        jsonb_build_object('key', 'decision_maker', 'value', 'Decide junto con su esposo')),
      jsonb_build_array(jsonb_build_object('id', 'h1', 'text', 'Desconfía de que la documentación del terreno esté en regla.', 'category', 'trust', 'source', 'generated')),
      'Hola. Vi el lote en Lurín, pero me queda muy lejos de Lima y no sé si vale la pena ir hasta allá.');
    perform pg_temp.seed_messages(v_s1, v_org, v_user, v_t1, jsonb_build_array(
      jsonb_build_object('author', 'buyer', 'content', 'Hola. Vi el lote en Lurín, pero me queda muy lejos de Lima y no sé si vale la pena ir hasta allá.', 'after', 45),
      jsonb_build_object('author', 'seller', 'content', 'Hola, soy Ana de Inmobiliaria Sur. Entiendo, la distancia es importante. ¿Me cuenta para qué está pensando el lote: vivienda o inversión?'),
      jsonb_build_object('author', 'buyer', 'content', 'Más que todo inversión. Quiero algo que me dé tranquilidad para mis hijos.', 'before', 45, 'after', 52, 'delta', 7),
      jsonb_build_object('author', 'seller', 'content', '¿Qué presupuesto aproximado maneja y en qué plazo le gustaría decidir?'),
      jsonb_build_object('author', 'buyer', 'content', 'Tengo entre S/ 45 000 y S/ 50 000, y quisiera decidir antes de fin de año.', 'before', 52, 'after', 60, 'delta', 8, 'revealed', jsonb_build_array('budget', 'timeline')),
      jsonb_build_object('author', 'seller', 'content', 'El lote tiene partida registral inscrita en Sunarp y habilitación urbana aprobada; puedo mostrarle los documentos. ¿Le parece si agendamos una visita este sábado?'),
      jsonb_build_object('author', 'buyer', 'content', 'Eso me tranquiliza, porque me preocupaba que los papeles no estuvieran en regla. El sábado puedo.', 'before', 60, 'after', 74, 'delta', 14, 'hidden', 'h1'),
      jsonb_build_object('author', 'seller', 'content', 'Excelente. Le recomiendo no esperar mucho porque quedan pocos lotes. Le confirmo el sábado a las 10 a. m. y le envío la ubicación por WhatsApp.'),
      jsonb_build_object('author', 'buyer', 'content', 'De acuerdo, nos vemos el sábado.', 'before', 74, 'after', 82, 'delta', 8, 'ends', true)
    ));
    insert into public.practice_session_reveals (organization_id, user_id, session_id, kind, item_key, value, message_seq, revealed_at) values
      (v_org, v_user, v_s1, 'revealable', 'budget', 'S/ 45 000 – S/ 50 000', 5, v_t1 + interval '200 seconds'),
      (v_org, v_user, v_s1, 'revealable', 'timeline', 'Antes de fin de año', 5, v_t1 + interval '200 seconds'),
      (v_org, v_user, v_s1, 'hidden_objection', 'h1', 'Desconfía de que la documentación del terreno esté en regla.', 7, v_t1 + interval '280 seconds');
    insert into public.simulation_consumptions (session_id, organization_id, user_id, consumed_at) values (v_s1, v_org, v_user, v_t1);
    insert into public.practice_evaluations (id, organization_id, user_id, session_id, rubric_id, rubric_version, prompt_version, model, total_score, level, strengths, improvements, suggested_drill_text, suggested_drill_stage, auto_attempts, manual_retries, created_at)
    values (v_e1, v_org, v_user, v_s1, v_rubric, '1.0', 'evaluator@1.0.0', 'gemini-seed', 72, 'developing',
      array['Preguntaste por el objetivo, el presupuesto y el plazo.', 'Respaldaste tu argumento con datos verificables del producto.'],
      array['Explora la objeción de distancia antes de proponer la visita.', 'Evita la urgencia artificial al cerrar.'],
      'Practica cómo indagar la causa de una objeción antes de responderla.', 'innova', 1, 0, v_t1 + interval '8 minutes');
    insert into public.practice_evaluation_criteria (organization_id, user_id, evaluation_id, criterion_id, status, score, max_score, evidence_seqs, justification, improvement, confidence)
    select v_org, v_user, v_e1, c.id, x.status::public.criterion_status, x.score, c.weight, x.evidence, x.justification, x.improvement, x.confidence
      from (values
        ('first_impression', 'evaluated', 8, array[2], 'Te presentaste y reconociste la preocupación por la distancia.', 'Valida la objeción con una pregunta antes de pasar a indagar.', 0.85),
        ('diagnosis', 'evaluated', 15, array[2, 4], 'Indagaste el objetivo, el presupuesto y el plazo.', 'Pregunta también quién participa en la decisión.', 0.8),
        ('active_listening', 'no_evaluable', null, array[]::int[], 'No hay evidencia suficiente de escucha activa en la conversación.', '', 0.4),
        ('value_argument', 'evaluated', 14, array[6], 'Usaste datos verificables (Sunarp, habilitación urbana) para generar valor.', 'Traduce los beneficios en resultados para su objetivo de inversión.', 0.75),
        ('objection_handling', 'evaluated', 9, array[6], 'Respondiste la preocupación por la documentación con evidencia.', 'Explora la objeción de distancia antes de proponer la visita.', 0.6),
        ('negotiation_close', 'evaluated', 12, array[6, 8], 'Propusiste un siguiente paso concreto y la clienta aceptó.', 'Evita la urgencia artificial ("quedan pocos lotes").', 0.7),
        ('follow_up', 'evaluated', 7, array[8], 'Confirmaste fecha, hora y canal del siguiente contacto.', 'Resume lo acordado y qué llevará cada parte a la visita.', 0.8)
      ) as x(key, status, score, evidence, justification, improvement, confidence)
      join public.rubric_criteria c on c.rubric_id = v_rubric and c.key = x.key;
    insert into public.practice_ethical_flags (organization_id, user_id, evaluation_id, type, explanation, message_seqs)
    values (v_org, v_user, v_e1, 'undue_pressure', 'Sugeriste que quedan pocos lotes sin que ese dato esté en la información del producto.', array[8]);

    -- Session 4: evaluated (older, lower score) ------------------------------------------------------------
    insert into public.practice_sessions (
      id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
      hints_enabled, focus_stage, selected_objection_ids, visible_objection, visible_objection_category,
      interest, last_interest_delta, seller_message_count, last_seq, hints_used, end_reason,
      setup_idempotency_key, configured_at, configured_expires_at, started_at, deadline_at, ended_at,
      buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model
    ) values (
      v_s4, v_org, v_user, v_p_hw, v_v_hw, 1, 'evaluated', 1, false, null, array[v_o_hw1, v_o_hw2],
      'En el mercado lo encuentro más barato.', 'competition', 47, -3, 2, 5, 0, 'seller_ended',
      gen_random_uuid(), v_t4 - interval '5 minutes', v_t4 + interval '1 day', v_t4, v_t4 + interval '20 minutes', v_t4 + interval '4 minutes',
      'buyer-setup@1.0.0', 'buyer@1.0.0', 'gemini-seed', 'gemini-seed'
    );
    insert into public.practice_buyer_profiles (session_id, organization_id, user_id, name, age, occupation, intro, goal, revealable_labels)
    values (v_s4, v_org, v_user, 'Julio Mamani', 35, 'Maestro de obra',
      'Necesita renovar sus herramientas para los trabajos de remodelación que hace los fines de semana.',
      'Concretar la compra del kit', '{budget,timeline,decision_maker}');
    insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables, hidden_objections, opening_message)
    values (v_s4, v_org, v_user,
      'Quiere herramientas que le duren para no comprar cada año.',
      'Directo y práctico; compara precios antes de comprar.',
      jsonb_build_array(
        jsonb_build_object('key', 'budget', 'value', 'Hasta S/ 380', 'budget_min', 300, 'budget_max', 380),
        jsonb_build_object('key', 'timeline', 'value', 'Esta semana'),
        jsonb_build_object('key', 'decision_maker', 'value', 'Lo consulta con su socio')),
      jsonb_build_array(jsonb_build_object('id', 'h1', 'text', 'Tengo que consultarlo con mi socio.', 'category', 'decision_maker', 'source', 'seller')),
      'Buenas. Vi el kit, pero en el mercado lo encuentro más barato.');
    perform pg_temp.seed_messages(v_s4, v_org, v_user, v_t4, jsonb_build_array(
      jsonb_build_object('author', 'buyer', 'content', 'Buenas. Vi el kit, pero en el mercado lo encuentro más barato.', 'after', 55),
      jsonb_build_object('author', 'seller', 'content', 'Nuestro kit es el mejor del mercado, se lo garantizo.'),
      jsonb_build_object('author', 'buyer', 'content', '¿Y por qué sería mejor? No me dice nada concreto.', 'before', 55, 'after', 50, 'delta', -5),
      jsonb_build_object('author', 'seller', 'content', 'Tiene garantía de un año. ¿Lo separamos hoy?'),
      jsonb_build_object('author', 'buyer', 'content', 'Lo voy a pensar.', 'before', 50, 'after', 47, 'delta', -3)
    ));
    insert into public.simulation_consumptions (session_id, organization_id, user_id, consumed_at) values (v_s4, v_org, v_user, v_t4);
    insert into public.practice_evaluations (id, organization_id, user_id, session_id, rubric_id, rubric_version, prompt_version, model, total_score, level, strengths, improvements, suggested_drill_text, suggested_drill_stage, auto_attempts, manual_retries, created_at)
    values (v_e4, v_org, v_user, v_s4, v_rubric, '1.0', 'evaluator@1.0.0', 'gemini-seed', 54, 'reinforcement',
      array['Mencionaste un beneficio concreto (garantía).'],
      array['Haz preguntas para entender la necesidad antes de argumentar.', 'Sustenta tus afirmaciones con datos del producto.'],
      'Practica preguntas abiertas de diagnóstico al inicio de la conversación.', 'conoce', 1, 0, v_t4 + interval '5 minutes');
    insert into public.practice_evaluation_criteria (organization_id, user_id, evaluation_id, criterion_id, status, score, max_score, evidence_seqs, justification, improvement, confidence)
    select v_org, v_user, v_e4, c.id, x.status::public.criterion_status, x.score, c.weight, x.evidence, x.justification, x.improvement, x.confidence
      from (values
        ('first_impression', 'evaluated', 6, array[2], 'Respondiste con cortesía, pero sin presentarte.', 'Preséntate y valida la comparación de precios.', 0.7),
        ('diagnosis', 'evaluated', 8, array[2, 4], 'No hiciste preguntas sobre la necesidad del cliente.', 'Pregunta para qué trabajos usará el kit.', 0.8),
        ('active_listening', 'no_evaluable', null, array[]::int[], 'No hay evidencia suficiente para evaluar la escucha.', '', 0.4),
        ('value_argument', 'evaluated', 12, array[4], 'Mencionaste la garantía, un beneficio verificable.', 'Relaciona la garantía con el ahorro a largo plazo.', 0.7),
        ('objection_handling', 'evaluated', 8, array[2], 'Respondiste la comparación de precios con una afirmación sin sustento.', 'Indaga con qué producto compara y explica la diferencia con datos.', 0.75),
        ('negotiation_close', 'evaluated', 9, array[4], 'Pediste el cierre antes de resolver las dudas.', 'Propón un siguiente paso cuando el cliente muestre interés.', 0.7),
        ('follow_up', 'no_evaluable', null, array[]::int[], 'La conversación terminó antes del seguimiento.', '', 0.5)
      ) as x(key, status, score, evidence, justification, improvement, confidence)
      join public.rubric_criteria c on c.rubric_id = v_rubric and c.key = x.key;
    insert into public.practice_ethical_flags (organization_id, user_id, evaluation_id, type, explanation, message_seqs)
    values (v_org, v_user, v_e4, 'unfounded_promise', 'Afirmaste que es "el mejor del mercado" sin datos del producto que lo respalden.', array[2]);

    -- Session 2: finalized with a failed evaluation (2 manual retries used) -----------------------------------
    insert into public.practice_sessions (
      id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
      hints_enabled, focus_stage, selected_objection_ids, visible_objection, visible_objection_category,
      interest, last_interest_delta, seller_message_count, last_seq, hints_used, end_reason,
      setup_idempotency_key, configured_at, configured_expires_at, started_at, deadline_at, ended_at,
      evaluation_status, evaluation_auto_attempts, evaluation_manual_retries, evaluation_failure_code,
      buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model
    ) values (
      v_s2, v_org, v_user, v_p_re, v_v_re2, 2, 'finalized', 2, true, 'conoce', array[v_o_re2, v_o_re3],
      'Está caro para lo que ofrece.', 'price', 52, 2, 1, 3, 0, 'seller_ended',
      gen_random_uuid(), v_t2 - interval '5 minutes', v_t2 + interval '1 day', v_t2, v_t2 + interval '20 minutes', v_t2 + interval '3 minutes',
      'failed', 3, 2, 'invalid_output',
      'buyer-setup@1.0.0', 'buyer@1.0.0', 'gemini-seed', 'gemini-seed'
    );
    insert into public.practice_buyer_profiles (session_id, organization_id, user_id, name, age, occupation, intro, goal, revealable_labels)
    values (v_s2, v_org, v_user, 'Carlos Huamán', 51, 'Comerciante',
      'Tiene un negocio de abarrotes y quiere comprar un terreno para construir un almacén.',
      'Agendar una visita al lote', '{budget,timeline,decision_maker}');
    insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables, hidden_objections, opening_message)
    values (v_s2, v_org, v_user,
      'Quiere dejar de alquilar el almacén de su negocio.',
      'Negociador y desconfiado con los vendedores.',
      jsonb_build_array(
        jsonb_build_object('key', 'budget', 'value', 'Hasta S/ 55 000', 'budget_min', 50000, 'budget_max', 55000),
        jsonb_build_object('key', 'timeline', 'value', 'En los próximos tres meses'),
        jsonb_build_object('key', 'decision_maker', 'value', 'Decide él solo')),
      jsonb_build_array(jsonb_build_object('id', 'h1', 'text', 'No sé si la documentación está en regla.', 'category', 'trust', 'source', 'seller')),
      'Buenas tardes. El lote me interesa, pero está caro para lo que ofrece.');
    perform pg_temp.seed_messages(v_s2, v_org, v_user, v_t2, jsonb_build_array(
      jsonb_build_object('author', 'buyer', 'content', 'Buenas tardes. El lote me interesa, pero está caro para lo que ofrece.', 'after', 50),
      jsonb_build_object('author', 'seller', 'content', 'Entiendo. ¿Para qué está pensando usar el terreno?'),
      jsonb_build_object('author', 'buyer', 'content', 'Para construir un almacén para mi negocio.', 'before', 50, 'after', 52, 'delta', 2)
    ));
    insert into public.simulation_consumptions (session_id, organization_id, user_id, consumed_at) values (v_s2, v_org, v_user, v_t2);

    -- Session 3: finalized by time without seller messages (not_applicable) ------------------------------------
    insert into public.practice_sessions (
      id, organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
      hints_enabled, focus_stage, selected_objection_ids, visible_objection, visible_objection_category,
      interest, last_interest_delta, seller_message_count, last_seq, hints_used, end_reason,
      setup_idempotency_key, configured_at, configured_expires_at, started_at, deadline_at, ended_at,
      evaluation_status,
      buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model
    ) values (
      v_s3, v_org, v_user, v_p_hw, v_v_hw, 1, 'finalized', 4, true, null, array[v_o_hw1],
      'En el mercado lo encuentro más barato.', 'competition', 35, 0, 0, 1, 0, 'time_limit',
      gen_random_uuid(), v_t3 - interval '5 minutes', v_t3 + interval '1 day', v_t3, v_t3 + interval '20 minutes', v_t3 + interval '20 minutes',
      'not_applicable',
      'buyer-setup@1.0.0', 'buyer@1.0.0', 'gemini-seed', 'gemini-seed'
    );
    insert into public.practice_buyer_profiles (session_id, organization_id, user_id, name, age, occupation, intro, goal, revealable_labels)
    values (v_s3, v_org, v_user, 'Lucía Torres', 29, 'Arquitecta',
      'Equipa su primer taller de maquetas y quiere herramientas confiables para trabajos finos.',
      'Concretar la compra del kit', '{budget,timeline,decision_maker}');
    insert into public.practice_session_secrets (session_id, organization_id, user_id, motivation, personality, revealables, hidden_objections, opening_message)
    values (v_s3, v_org, v_user,
      'Quiere equipar su taller sin gastar de más.',
      'Exigente y detallista; pide datos concretos.',
      jsonb_build_array(
        jsonb_build_object('key', 'budget', 'value', 'Alrededor de S/ 300', 'budget_min', 280, 'budget_max', 320),
        jsonb_build_object('key', 'timeline', 'value', 'Este mes'),
        jsonb_build_object('key', 'decision_maker', 'value', 'Decide ella')),
      jsonb_build_array(jsonb_build_object('id', 'h1', 'text', 'Teme que las piezas no sean de buena calidad.', 'category', 'trust', 'source', 'generated')),
      'Hola. El kit me llama la atención, pero en el mercado lo encuentro más barato.');
    perform pg_temp.seed_messages(v_s3, v_org, v_user, v_t3, jsonb_build_array(
      jsonb_build_object('author', 'buyer', 'content', 'Hola. El kit me llama la atención, pero en el mercado lo encuentro más barato.', 'after', 35)
    ));
    insert into public.simulation_consumptions (session_id, organization_id, user_id, consumed_at) values (v_s3, v_org, v_user, v_t3);
  end loop;
end;
$$;

-- AI usage for A and B: current month (today) and previous month; buyer/evaluator rows reference the
-- seeded sessions (FK since 002). The tutor row keeps a null simulation_id.
insert into public.ai_usage (organization_id, user_id, task, model, simulation_id, input_tokens, output_tokens, latency_ms, estimated_cost_usd, created_at) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'buyer', 'gemini-seed', '00000000-0000-4000-9000-000000000a01', 1200, 400, 900, 0.001200, now() - interval '5 minutes'),
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'evaluator', 'gemini-seed', '00000000-0000-4000-9000-000000000a01', 2000, 600, 1500, 0.002000, now() - interval '4 minutes'),
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-000000000011', 'buyer', 'gemini-seed', '00000000-0000-4000-9000-000000000a02', 800, 300, 700, 0.000800, date_trunc('month', now()) - interval '10 days'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-000000000012', 'tutor', 'gemini-seed', null, 1500, 500, 1100, 0.001500, now() - interval '3 minutes'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-000000000012', 'buyer', 'gemini-seed', '00000000-0000-4000-9000-000000000b02', 900, 350, 800, 0.000900, date_trunc('month', now()) - interval '12 days');

-- Evaluation dispatcher (research.md §R8): local URL and development secret in Vault. Production loads
-- them with scripts/ops/set-practice-dispatch.ts, never in a migration. The secret matches
-- PRACTICE_DISPATCH_SECRET in .env.example and playwright.config.ts.
select vault.create_secret('http://host.docker.internal:3000', 'practice_dispatch_url', 'Practice evaluation dispatcher base URL (local)');
select vault.create_secret('local-dev-practice-dispatch-secret-0000000000', 'practice_dispatch_secret', 'Practice evaluation dispatcher bearer secret (local)');
