# Implementation Plan: Práctica del vendedor con cliente simulado por IA, evaluación con rúbrica e historial

**Branch**: `002-seller-practice` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-seller-practice/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Núcleo de valor del producto sobre la base de 001: el vendedor registra productos versionados y sus
objeciones, configura una práctica (producto, 1–3 objeciones, dificultad 1–5, pistas, etapa foco),
conversa por texto con un comprador ficticio generado por IA que responde en streaming y mantiene un
termómetro de interés, recibe una evaluación automática con la rúbrica "Ventas consultivas v1.0"
(evidencias por id de mensaje, banderas éticas, total normalizado por el sistema) y sigue su
evolución en Historial y en la nueva pantalla de inicio "Hoy".

Enfoque técnico (detalle en [research.md](./research.md)): Vercel AI SDK v6 + `@ai-sdk/google` detrás
de un adaptador `server-only` con un proveedor falso determinista para pruebas; prompts versionados
con hash bloqueado; cada turno es **una** llamada con salida estructurada (`reply` en streaming +
metadatos validados) servida por un Route Handler NDJSON; todas las transiciones de estado, la
cuota (consumo atómico con bloqueo de `quotas`) y las reglas del termómetro viven en funciones
Postgres probadas con pgTAP; los secretos del comprador están en una tabla que la RLS solo abre al
finalizar; la evaluación corre en segundo plano con `after()` + `pg_cron`/`pg_net` (despachador
interno firmado) con validación en dos capas (TS y SQL) y total recalculado en SQL.

## Technical Context

**Language/Version**: TypeScript 5.9 (`strict`) sobre Node.js 24 LTS; SQL (PostgreSQL 17 de Supabase) para migraciones, RLS, funciones y `pg_cron`.

**Primary Dependencies**: las de 001 (Next.js 16.4 App Router, React 19.3, Tailwind v4, shadcn/ui, Zod 4, `@supabase/ssr`, vaul, Motion, Sentry) + **nuevas**: `ai` (Vercel AI SDK v6) y `@ai-sdk/google` ([research.md §R1](./research.md#r1-dependencias-nuevas)). Extensiones Supabase nuevas: `pg_net` y Vault (incluidas, sin costo).

**Storage**: Supabase Postgres: 15 tablas nuevas (productos, versiones, objeciones, rúbrica y criterios, sesiones, ficha pública, secretos, revelados, mensajes, evaluaciones, criterios, banderas, consumiciones, intentos de configuración), cambios en `ai_usage` y en dos funciones `admin_*` de 001. RLS en todas; [data-model.md](./data-model.md).

**Testing**: Vitest (dominio, prompts, adaptador con `MockLanguageModelV3`, dataset dorado offline), pgTAP (RLS, aislamiento A/B, reglas de turno, cuota, evaluación, mantenimiento), Playwright + axe con `AI_PROVIDER=fake` (móvil 360 y escritorio, ambos temas), dataset dorado en vivo (`pnpm test:golden`, workflow `golden.yml`).

**Target Platform**: Web en Vercel (Fluid Compute, runtime Node; `maxDuration` 60 s en turnos y 300 s en el despachador) + Supabase gestionado; mismos navegadores que 001.

**Project Type**: Aplicación web full-stack (mismo proyecto Next.js de 001; dominio nuevo en `src/features/products` y `src/features/practice`).

**Performance Goals**: primer fragmento del cliente < 2,5 s p95 (SC-007); 95 % de evaluaciones < 60 s (SC-008) y todas ≤ 3 min o fallidas (FR-043); páginas principales p95 < 3 s, LCP < 2,5 s, CLS < 0,1 en 4G (Principio IV).

**Constraints**: capa gratuita de Gemini (límites por minuto y día por proyecto, solo datos ficticios; [research.md §R16](./research.md#r16-capacidad-y-costos-de-la-capa-gratuita-de-gemini-principio-vi-alerta-de-negocio)); cuota verificada antes de toda llamada de IA; ningún contenido en logs; WCAG 2.2 AA a 360 px y solo teclado; estilos solo con tokens; sesión ≤ 20 mensajes del vendedor y ≤ 20 min.

**Scale/Scope**: piloto de decenas de vendedores; ≤ 30 configuraciones/usuario/día; ~9 pantallas nuevas (Hoy, productos ×3, practicar, sesión con 5 vistas por estado, historial); 3 agentes de IA; ≥ 10 casos en el dataset dorado.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Aislamiento multiempresa** | Toda tabla nueva de negocio con `organization_id NOT NULL` + FK + índice; `rubrics`/`rubric_criteria` declaradas como plataforma en la prueba guardiana. RLS en todas: productos por organización; sesiones, mensajes y evaluaciones solo del dueño (`user_id = auth.uid()` + org activa); secretos solo al finalizar. Sin escritura directa desde el cliente: todo vía funciones `security definer` que repiten organización, rol y dueño; ids ajenos → `P0002`/404 sin revelar existencia. Guards de servidor de 001 en cada acción y ruta. pgTAP A/B para cada tabla y función nueva + e2e A/B (URLs y peticiones directas). Superadmin sin políticas sobre contenido; `admin_*` solo leen tablas sin contenido (FR-054–FR-056, AC-01). | ✅ |
| **II. Seguridad y privacidad** | Clave de Gemini y secreto del despachador solo en servidor (`server-only`, escaneo de bundle ampliado a `GOOGLE_GENERATIVE_AI_API_KEY` y `PRACTICE_DISPATCH_SECRET`); secreto en Vault para `pg_net`; ruta interna con Bearer en tiempo constante. La ruta interna no es un webhook de terceros: la llama solo `pg_net` y su cuerpo lleva únicamente ids de sesión. Un *replay* es inocuo porque `claim_practice_evaluation` solo toma evaluaciones `pending` (`SKIP LOCKED`; una evaluación ya tomada, guardada o fallida no se vuelve a ejecutar), y eso cumple la regla de prevenir replay sin firma por petición. Zod en Server Actions, Route Handlers, parámetros y query. Rate limiting: `user_mutation` en acciones, nuevo ámbito `practice_turn` (20/min) en el streaming y nuevo ámbito `practice_status` (60/min) en el polling de estado; topes de configuración propios. Idempotencia: creación de producto, configuración, comenzar (por estado), mensaje (`client_message_id`), terminar, reintentar evaluación; despachador idempotente por `claim`. Auditoría de eliminaciones/archivos (`objection.deleted`, `product.archived/reactivated`). Logs y Sentry sin texto de mensajes, fichas, productos ni evaluaciones (FR-057; `beforeSend` descarta cuerpos de `/api/practicas/*`). Aviso de datos ficticios en el formulario de producto (capa gratuita). | ✅ |
| **III. IA responsable** | Adaptador único `src/lib/ai` sobre AI SDK; modelo por tarea en variables de entorno; proveedor intercambiable. Prompts en servidor, versionados, con hash bloqueado por prueba, límites de longitud y datos no confiables delimitados (AC-09). Salidas estructuradas validadas con Zod + reglas de dominio, reintentos acotados y fallo controlado (ficha, turno, evaluación). Evaluador: solo ids de mensajes del vendedor existentes, nunca > peso, `no_evaluable` sin evidencia, total recalculado por el sistema, versiones de rúbrica y prompt guardadas (AC-04, AC-06). `ai_usage` por intento con tokens, latencia, costo y resultado. Cuota verificada antes de llamar al modelo (AC-07). Banderas éticas de promesas sin sustento y presión indebida; el cliente simulado reacciona en contra de esas tácticas. Aviso "Evaluación automática y orientativa". | ✅ |
| **IV. UX/UI de excelencia** | Mobile-first 360 px, bottom-sheet de 001 para el panel, solo teclado, foco visible, 44 px, `aria-live` (mensaje completo al final del streaming; interés y desbloqueos no intrusivos), `prefers-reduced-motion` en gauge/anillo. Solo tokens (nuevo token semántico `highlight` para el mensaje citado, con par de contraste en la prueba de tokens). Estados vacío/carga/error/sin permiso/éxito por pantalla ([contracts/routes.md](./contracts/routes.md)). Streaming con indicador. `S/` es-PE y fechas en la zona de la organización. Gráfico propio con alternativa en tabla. Web Vitals: como no hay preview por PR (ver Principio V), se miden con Lighthouse en CI sobre el build local (`scripts/ci/lighthouse.mjs`, T191) y en producción con Vercel Analytics. | ⚠️ justificada (sin preview: Web Vitals en CI) |
| **V. Calidad verificable** | Pirámide completa: Vitest, pgTAP, Playwright + axe, dataset dorado (≥ 10 casos; offline bloqueante en CI y en vivo en `golden.yml`). Trazabilidad historia → FR/AC → prueba en `tasks.md`. SC de rendimiento medidos con `ai_usage.first_chunk_ms` y tiempos de evaluación. Sin preview de Vercel por PR ni staging: la evidencia del PR sale del CI (Supabase local con `supabase db reset`, e2e con Playwright + axe, Lighthouse) más las capturas móvil y escritorio (claro y oscuro) de la sección "Capturas" de la plantilla de PR. | ⚠️ justificada (dataset en vivo fuera del CI de cada PR; sin preview por PR ni staging) |
| **VI. Simplicidad** | Mismo proyecto; solo 2 dependencias nuevas justificadas; sin colas, Redis, Realtime ni librerías de gráficos: `after()` + `pg_cron` + `pg_net` (nativos) para segundo plano; polling simple para el progreso; pistas desde catálogo fijo (sin IA). Fuera de alcance respetado (voz, escenarios curados, tutor, coach, revisión humana, certificados, edición de rúbricas). | ✅ |
| **VII. Versionado y migraciones** | Productos con versiones inmutables (trigger); rúbrica v1.0 inmutable publicada en **migración** (no en seed); prompts versionados; sesiones guardan versión de producto, prompts y modelos; evaluaciones inmutables con `rubric_version`/`prompt_version`. Migraciones de Supabase CLI con rollback documentado en el encabezado; `supabase db reset` en CI. | ✅ |
| **Restricciones técnicas** | Stack conforme (Next.js App Router, Server Actions para mutaciones, Route Handlers para streaming, AI SDK + Gemini, Supabase). Moneda `S/` en precios del cliente; el costo de IA sigue en US$ (desviación ya registrada en 001). Entornos: solo local/CI y producción (sin staging ni previews de Vercel), justificado en *Complexity Tracking*. | ⚠️ justificada |

**Resultado del gate (pre-Phase 0)**: PASA, con tres desviaciones justificadas en *Complexity
Tracking*: dataset dorado en vivo fuera del CI por PR; extensiones `pg_net` + Vault y ruta interna
para el trabajo en segundo plano; y entornos solo local/CI y producción, sin staging ni previews.
Ninguna afecta a los Principios I ni II (no negociables).

**Re-evaluación post-Phase 1**: PASA. El diseño ([data-model.md](./data-model.md),
[contracts/](./contracts/)) mantiene `organization_id NOT NULL` indexado en las 13 tablas de
negocio nuevas, no expone escritura directa a `authenticated` en ninguna, oculta los secretos por RLS
(no solo en la UI) y repite toda validación crítica en SQL (cuota, reglas del termómetro, evidencias,
total). El diseño introdujo un cambio a 001 que no viola principios: el conteo de simulaciones del
panel de superadmin pasa a `simulation_consumptions` (tabla sin contenido). No aparecieron
dependencias nuevas durante el diseño.

## Project Structure

### Documentation (this feature)

```text
specs/002-seller-practice/
├── plan.md              # Este archivo
├── research.md          # Phase 0: decisiones técnicas (R1–R16)
├── data-model.md        # Phase 1: tablas, enums, RLS, estados, cálculos
├── quickstart.md        # Phase 1: guía de validación end-to-end
├── contracts/
│   ├── routes.md          # Rutas UI, navegación, estados por pantalla
│   ├── server-actions.md  # Server Actions: entrada Zod, orden, errores
│   ├── route-handlers.md  # Streaming NDJSON del turno, estado, despachador interno
│   ├── database-rpc.md    # Funciones Postgres, ERRCODE nuevos, grants
│   └── ai-agents.md       # Ficha, cliente simulado, evaluador, dataset dorado
├── checklists/
└── tasks.md             # Phase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/
│   │   ├── inicio/                      # "Hoy" (reemplaza "La práctica llega pronto")
│   │   ├── productos/  page.tsx · nuevo/ · [id]/
│   │   ├── practicar/                   # configurar o práctica en curso
│   │   ├── practicas/[id]/              # previa · chat · progreso · resultado (según estado)
│   │   └── historial/
│   └── api/
│       ├── practicas/[id]/turnos/route.ts       # POST, NDJSON streaming
│       ├── practicas/[id]/estado/route.ts       # GET, polling de evaluación
│       └── internal/practice/evaluations/route.ts  # POST, despachador pg_net
├── components/
│   ├── app-shell/nav-config.ts          # Hoy · Practicar · Historial · Mis productos
│   └── ui/                              # + score-trend-chart, cautiva-strip, chip (sobre tokens)
├── features/
│   ├── products/                        # schemas, actions, queries, objection-suggestions.ts, components/
│   ├── practice/
│   │   ├── domain/                      # difficulty, mood, limits, scoring (total, level, stages), quota-copy, draw
│   │   ├── hints/                       # catalog.ts, select.ts
│   │   ├── ai/                          # prompts/ (+ prompts.lock.json), schemas, buyer-setup.ts, buyer-turn.ts,
│   │   │                                # evaluator.ts, guards.ts, validate-persona/turn-meta/evaluation.ts
│   │   ├── evaluation/run-evaluation.ts # claim → fases → IA → validar → guardar / fallar
│   │   ├── stream/                      # protocol.ts (tipos de eventos), read-ndjson.ts
│   │   ├── actions.ts  queries.ts  schemas.ts
│   │   └── components/                  # setup-form, pre-screen, chat/, panel/ (thermometer, reveals),
│   │                                    # evaluation-progress, result/ (criteria, quotes, buyer-revealed, transcript)
│   ├── history/                         # queries, filters schema, components
│   └── today/                           # queries (recomendación FR-052), components
├── lib/
│   ├── ai/                              # provider.ts (getModel), config.ts, pricing.ts, retry.ts, usage.ts,
│   │                                    # fake/ (proveedor determinista, solo pruebas)
│   ├── action-result.ts                 # + quota_exhausted, setup_limit, active_session, ai_unavailable
│   ├── security/rate-limit-config.ts    # + practice_turn, practice_status
│   └── env.ts                           # + AI_PROVIDER, GOOGLE_GENERATIVE_AI_API_KEY, AI_MODEL_*, PRACTICE_DISPATCH_SECRET
└── styles/tokens.css                    # + highlight / on-highlight
supabase/
├── migrations/2026112400xxxx_*.sql      # enums · productos · rúbrica v1.0 · sesiones · mensajes · evaluaciones ·
│                                        # consumiciones · RLS · funciones · cambios a 001 · pg_net + mantenimiento
├── seed.sql                             # + productos, sesiones y evaluaciones de ejemplo A/B, Vault local
└── tests/database/2x_*.test.sql         # pgTAP de 002
scripts/ops/set-practice-dispatch.ts     # carga URL/secreto del despachador en Vault (producción)
tests/
├── unit/practice/  unit/products/  unit/ai/
├── golden/                              # cases/, recorded/, offline.test.ts, live.test.ts
└── e2e/practice-*.spec.ts  products.spec.ts  history.spec.ts  today.spec.ts  isolation-practice.spec.ts
.github/workflows/ci.yml                 # + golden offline (en unit), bundle-secrets ampliado
.github/workflows/golden.yml             # dataset dorado en vivo (PR con cambios de prompts/esquemas + semanal)
```

**Structure Decision**: se mantiene el proyecto único de 001 y su organización por *features*. La
lógica pura y probable sin red (reglas, cálculos, validaciones, pistas, construcción de prompts) vive
en `domain/`, `hints/` y `ai/` sin dependencias de Next; la infraestructura de IA en `src/lib/ai`
(única puerta al proveedor); las reglas de estado autoritativas en funciones Postgres. Rutas visibles
en español; código en inglés.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| El dataset dorado **en vivo** (evaluador y cliente reales) no corre en el CI de cada PR; corre en `golden.yml` en los PR que tocan `src/features/practice/ai/**` o `tests/golden/**`, semanalmente y a demanda, y el checklist del PR exige su resultado verde. La parte offline (validadores y totales sobre salidas grabadas) sí es bloqueante en CI. | Requiere la clave de Gemini como secreto de CI, consume la cuota gratuita compartida con producción (R16) y es no determinista; correrlo en cada PR agotaría la cuota diaria sin aportar señal cuando no cambian prompts ni esquemas. | Ejecutarlo en todo PR: costo/cuota sin beneficio. Solo offline: no verificaría SC-003/SC-006 contra el modelo real. |
| Trabajo en segundo plano con `pg_cron` + **`pg_net`** + **Vault** y una ruta interna `/api/internal/practice/evaluations` | FR-028d exige cerrar sesiones por tiempo "aunque nadie la abra" y FR-043 evaluar "sin depender de que el vendedor mantenga la página abierta"; `after()` cubre los cierres iniciados por una petición, pero no los cierres por tiempo. | Vercel Cron por minuto (exige plan Pro); Vercel Queues/Workflow (producto beta o dependencia nueva); Edge Functions de Supabase (segundo runtime y adaptador de IA duplicado); evaluar al abrir la página (incumple FR-043). |
| Sin **staging** ni **preview de Vercel por PR** (la constitución los pide en el Principio V, en Restricciones técnicas y en el Flujo de desarrollo, y mide los Web Vitals en el preview, Principio IV). Entornos: local/CI (Supabase local, `supabase db reset`) y producción (único proyecto Supabase); previews deshabilitadas en Vercel (decisión del 2026-11-23, commit `74b5e69`). Sustitutos: CI bloqueante (lint, typecheck, Vitest, pgTAP, Playwright + axe con `AI_PROVIDER=fake`, Lighthouse con los presupuestos de 001 en T191, escaneo de secretos), capturas móvil y escritorio (claro y oscuro) en la sección "Capturas" de la plantilla de PR (Playwright solo guarda capturas en fallos), `seed.sql` nunca en producción, migraciones con `supabase db push` y salida a producción solo con aprobación explícita (T197). | Costo y simplicidad del piloto: un segundo proyecto Supabase duplica el costo y la operación. Una preview sin base de datos no funciona, y apuntarla a producción permitiría que código de un PR no revisado tocara datos reales. | Staging dedicado: costo y operación duplicados para un piloto de decenas de usuarios. Previews contra producción: riesgo de datos (Principio II). Previews contra Supabase *branching*: servicio de pago. Si el producto sale del piloto, se reevalúa con una enmienda de la constitución. |
