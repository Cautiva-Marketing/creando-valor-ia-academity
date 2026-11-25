-- Migration: immutable rubric and the published rubric "Ventas consultivas 1.0" (T011) —
-- data-model.md → "Rúbrica (plataforma, inmutable)", FR-036, FR-037. The rubric is published HERE and
-- never in seed.sql (seed.sql never runs in production, Constitution VII).
--
-- Rollback:
--   drop table if exists public.rubric_criteria, public.rubrics;
--   drop function if exists private.assert_rubric_complete(uuid), private.cautiva_stages_unique(public.cautiva_stage[]);

create or replace function private.cautiva_stages_unique(p_stages public.cautiva_stage[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_stages is not null
     and cardinality(p_stages) >= 1
     and (select count(*) = count(distinct s) from unnest(p_stages) as s);
$$;
revoke all on function private.cautiva_stages_unique(public.cautiva_stage[]) from public;
grant execute on function private.cautiva_stages_unique(public.cautiva_stage[]) to authenticated, service_role;

-- rubrics (platform reference: no organization_id) --------------------------------------------------
create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  slug text not null constraint rubrics_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null constraint rubrics_name_length check (char_length(btrim(name)) between 1 and 120),
  version text not null constraint rubrics_version_format check (version ~ '^[0-9]+\.[0-9]+$'),
  is_current boolean not null,
  published_at timestamptz not null,
  constraint rubrics_slug_version_key unique (slug, version)
);
create unique index rubrics_current_slug_key on public.rubrics (slug) where is_current;

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics (id) on delete restrict,
  key text not null constraint rubric_criteria_key_format check (key ~ '^[a-z_]+$'),
  name text not null constraint rubric_criteria_name_length check (char_length(btrim(name)) between 1 and 120),
  weight smallint not null constraint rubric_criteria_weight_range check (weight between 1 and 100),
  stages public.cautiva_stage[] not null
    constraint rubric_criteria_stages_valid check (private.cautiva_stages_unique(stages)),
  description text not null constraint rubric_criteria_description_length check (char_length(btrim(description)) >= 1),
  anchors jsonb not null
    constraint rubric_criteria_anchors_shape check (
      jsonb_typeof(anchors) = 'object'
      and jsonb_typeof(anchors -> 'low') = 'string'
      and jsonb_typeof(anchors -> 'mid') = 'string'
      and jsonb_typeof(anchors -> 'high') = 'string'
    ),
  position smallint not null constraint rubric_criteria_position_positive check (position >= 1),
  constraint rubric_criteria_rubric_key_key unique (rubric_id, key),
  constraint rubric_criteria_rubric_position_key unique (rubric_id, position)
);
create index rubric_criteria_rubric_idx on public.rubric_criteria (rubric_id);

-- A published rubric is complete: weights add up to 100 and every C.A.U.T.I.V.A.™ stage has at least
-- one criterion (FR-037).
create or replace function private.assert_rubric_complete(p_rubric uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_missing int;
begin
  select coalesce(sum(c.weight), 0) into v_total from public.rubric_criteria c where c.rubric_id = p_rubric;
  if v_total <> 100 then
    raise exception 'rubric weights must add up to 100 (got %)', v_total using errcode = '23514';
  end if;
  select count(*) into v_missing
    from unnest(enum_range(null::public.cautiva_stage)) as s
   where not exists (
     select 1 from public.rubric_criteria c where c.rubric_id = p_rubric and s = any (c.stages)
   );
  if v_missing > 0 then
    raise exception 'every C.A.U.T.I.V.A. stage needs a criterion (% missing)', v_missing
      using errcode = '23514';
  end if;
end;
$$;
revoke all on function private.assert_rubric_complete(uuid) from public;
grant execute on function private.assert_rubric_complete(uuid) to service_role;

-- Publish "Ventas consultivas 1.0" ------------------------------------------------------------------------
-- Descriptions and anchors are original copy based on the master document §6 (observable conduct and
-- simulation evidence per stage) and Annex B (consultative real estate case).
insert into public.rubrics (id, slug, name, version, is_current, published_at)
values ('00000000-0000-4000-8000-0000000000a1', 'ventas-consultivas', 'Ventas consultivas', '1.0', true, '2026-11-24T00:00:00Z');

insert into public.rubric_criteria (rubric_id, position, key, name, weight, stages, description, anchors) values
  ('00000000-0000-4000-8000-0000000000a1', 1, 'first_impression', 'Primera impresión y confianza', 10, '{conoce}',
   'Saluda con respeto, se presenta con claridad y genera un clima de confianza antes de vender. Trata al cliente con cortesía aunque la conversación se ponga difícil.',
   jsonb_build_object(
     'low', 'Entra directo a vender o con un tono brusco o insistente; ignora la objeción inicial o la descalifica.',
     'mid', 'Saluda con cortesía y reconoce la objeción, pero sin presentarse ni generar un vínculo claro.',
     'high', 'Se presenta, valida la preocupación inicial del cliente y propone conversar sobre su situación antes de ofrecer.')),
  ('00000000-0000-4000-8000-0000000000a1', 2, 'diagnosis', 'Diagnóstico y preguntas', 20, '{conoce}',
   'Investiga el contexto, la motivación y la necesidad con preguntas abiertas y pertinentes (para qué, cuándo, quién decide, cuánto) y resume lo que entiende.',
   jsonb_build_object(
     'low', 'No hace preguntas o solo pregunta si quiere comprar; supone la necesidad del cliente.',
     'mid', 'Hace algunas preguntas útiles, pero deja sin explorar el objetivo, el plazo, el presupuesto o quién decide.',
     'high', 'Descubre el objetivo, los criterios de decisión, el plazo y el presupuesto con preguntas abiertas, y resume las necesidades con sus palabras.')),
  ('00000000-0000-4000-8000-0000000000a1', 3, 'active_listening', 'Escucha activa y empatía', 10, '{une}',
   'Retoma lo que dice el cliente, valida sus emociones y conecta explícitamente su necesidad con la oferta.',
   jsonb_build_object(
     'low', 'Responde con un guion fijo sin considerar lo que el cliente dijo.',
     'mid', 'Reconoce algunas respuestas del cliente, pero no conecta su necesidad con la oferta.',
     'high', 'Parafrasea, valida la preocupación del cliente y vincula cada propuesta con una necesidad que él expresó.')),
  ('00000000-0000-4000-8000-0000000000a1', 4, 'value_argument', 'Argumentación de valor', 20, '{aumenta,transforma}',
   'Eleva el valor percibido con beneficios específicos y demostrables y traduce características en resultados para el cliente, usando solo datos del producto.',
   jsonb_build_object(
     'low', 'Enumera características genéricas o hace afirmaciones sin sustento (p. ej., valorización futura o títulos no indicados).',
     'mid', 'Menciona beneficios del producto, pero sin relacionarlos con resultados concretos para este cliente.',
     'high', 'Explica resultados concretos para el cliente con beneficios y datos verificables del producto, sin exagerar ni inventar.')),
  ('00000000-0000-4000-8000-0000000000a1', 5, 'objection_handling', 'Manejo de objeciones', 15, '{innova}',
   'Explora la objeción antes de responder, propone alternativas útiles y creativas sin inventar condiciones y verifica si la duda quedó resuelta.',
   jsonb_build_object(
     'low', 'Ignora, minimiza o discute la objeción; responde con presión o con condiciones inventadas.',
     'mid', 'Responde la objeción visible con argumentos razonables, pero no indaga la causa ni descubre objeciones ocultas.',
     'high', 'Indaga la causa de la objeción, descubre preocupaciones ocultas y propone alternativas útiles respaldadas por datos del producto.')),
  ('00000000-0000-4000-8000-0000000000a1', 6, 'negotiation_close', 'Negociación y cierre', 15, '{vende}',
   'Solicita un compromiso adecuado al momento de la conversación (siguiente paso, acuerdo o cierre informado) sin presión indebida ni urgencia artificial.',
   jsonb_build_object(
     'low', 'No pide ningún compromiso o lo fuerza con escasez falsa, urgencia artificial o presión.',
     'mid', 'Propone un siguiente paso, pero de forma vaga o antes de haber resuelto las dudas principales.',
     'high', 'Propone un compromiso concreto y proporcional (p. ej., agendar una visita) cuando el cliente está listo, y confirma su aceptación.')),
  ('00000000-0000-4000-8000-0000000000a1', 7, 'follow_up', 'Seguimiento y siguiente paso', 10, '{asegura}',
   'Confirma expectativas, acuerda fecha, canal y responsables del siguiente paso y ofrece verificación o acompañamiento posterior.',
   jsonb_build_object(
     'low', 'Termina sin acordar nada ni confirmar lo conversado.',
     'mid', 'Menciona un seguimiento general sin fecha, canal ni responsables.',
     'high', 'Resume lo acordado, define fecha y canal del siguiente contacto y confirma qué hará cada parte.'));

select private.assert_rubric_complete('00000000-0000-4000-8000-0000000000a1');

-- Immutable once published (FR-036, SC-004), also for service_role.
create trigger rubrics_immutable before update or delete on public.rubrics
  for each row execute function private.reject_immutable_change();
create trigger rubric_criteria_immutable before update or delete on public.rubric_criteria
  for each row execute function private.reject_immutable_change();
