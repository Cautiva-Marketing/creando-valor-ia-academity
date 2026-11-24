---

description: "Lista de tareas para implementar la fundación de la plataforma Creando Valor IA™"
---

# Tasks: Fundación de la plataforma Creando Valor IA™

**Input**: Documentos de diseño en `/specs/001-platform-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (routes, server-actions, database-rpc, emails), quickstart.md

**Tests**: SÍ se incluyen. La spec los exige (FR-005, SC-004, SC-006, SC-009) y la constitución (Principio V)
obliga a la pirámide Vitest + pgTAP + Playwright/axe y a la trazabilidad historia → AC → prueba. Dentro de
cada historia, las pruebas se escriben primero y deben FALLAR antes de implementar.

**Organization**: Tareas agrupadas por historia de usuario. Las cuatro historias P1 se ordenan por
dependencia funcional (US3 sesión → US4 MFA → US1 invitaciones → US2 activación), porque el panel de
invitaciones necesita un superadmin con sesión `aal2` y la activación necesita invitaciones. Las etiquetas
`[USn]` conservan la numeración de spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1…US10)
- Las restricciones de campos se citan como `data-model.md` + `Entity.field`; no se repiten aquí salvo
  cuando la tarea las acota.

## Path Conventions

Proyecto único Next.js en la raíz (plan.md → Project Structure): `src/`, `supabase/`, `tests/`,
`scripts/`, `content/`, `.github/`.

**Regla de datos e2e (todas las pruebas Playwright)**: los datos sembrados por T021 son de **solo
lectura** en e2e. Toda prueba que mute estado (MFA, contraseña, suspensión, bloqueos por rate limit,
invitaciones, solicitudes, onboarding, perfil) crea sus propios datos con las factorías de T059
(`tests/e2e/fixtures/factories.ts`, correos `<prefijo>+<uuid>@ejemplo.test`). Toda prueba usa una IP
única (`uniqueClientIp()` de `tests/e2e/fixtures/network.ts`), salvo cuando prueba explícitamente un
límite por IP, y entonces usa una IP fija propia de esa prueba (`fixedClientIp(testInfo)`, distinta
también entre proyectos). Así los 4 proyectos de T007 se
ejecutan en paralelo sin compartir estado ni contadores (research.md §R9, §R20).

**Listados y agregados globales**: como las factorías de pruebas paralelas añaden filas a los listados,
las aserciones localizan siempre la fila propia por su correo u organización únicos (búsqueda o filtro
del listado), nunca por posición ni por página. Las pruebas que comprueban un agregado global (contador
de solicitudes nuevas) o un listado sin búsqueda (bandeja de solicitudes) se etiquetan `@global` y se
ejecutan en el proyecto `global` de T007, que corre después de los 4 proyectos paralelos y en serie, de
modo que solo ellas modifican esos datos mientras se ejecutan. Las factorías nunca crean filas de
`ai_usage`: los totales de consumo (T131) dependen solo de los datos sembrados.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicializar el proyecto, herramientas y configuración base.

- [X] T001 Inicializar Next.js 16 (App Router, `src/`, pnpm, Node 24) en la raíz: `package.json`, `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, alias `@/*` → `src/*`), `next.config.ts`, `.gitignore`, `.nvmrc` (`24`)
- [X] T002 Instalar dependencias de ejecución de research.md §R1 con versiones exactas fijadas en `package.json` (next, react, react-dom, @supabase/ssr, @supabase/supabase-js, tailwindcss, @tailwindcss/postcss, radix-ui, class-variance-authority, clsx, tailwind-merge, lucide-react, motion, zod, next-themes, sonner, vaul, cmdk, @react-email/components, @react-email/render, nodemailer, standardwebhooks, server-only, @sentry/nextjs, @vercel/analytics, @vercel/speed-insights)
- [X] T003 Instalar dependencias de desarrollo de research.md §R1 en `package.json` (vitest, @playwright/test, @axe-core/playwright, @lhci/cli, supabase, tsx, eslint, eslint-config-next, prettier, @types/nodemailer, @types/node, typescript)
- [X] T004 [P] Configurar Tailwind v4: `postcss.config.mjs`, `src/styles/globals.css` (importa `tokens.css`, aún vacío) y `components.json` de shadcn/ui (alias `@/components/ui`, css `src/styles/globals.css`)
- [X] T005 [P] Configurar ESLint flat en `eslint.config.mjs` (eslint-config-next + regla `no-restricted-syntax` que, fuera de `src/styles/`, falla con literales hex/rgb/hsl/oklch, con cualquier valor arbitrario de Tailwind `*-[…]` (incluidos `text-[13px]`, `w-[…]`, `shadow-[…]`) y con props `style` con valores literales (solo `var(--…)`); NO afecta a las variantes arbitrarias (`data-[state=open]:`, `aria-[…]:`, `group-[…]:`, `peer-[…]:`, `has-[…]:`) ni a la sintaxis de variables `*-(--…)` de Tailwind v4 usada por shadcn/Radix; excepciones solo con `eslint-disable` justificado, research.md §R14) y Prettier en `.prettierrc` + `.prettierignore`. Añadir la prueba `tests/unit/lint/no-literal-styles.test.ts` (API de ESLint sobre fixtures válidos e inválidos en `tests/unit/lint/fixtures/`, incluido un fixture válido con `data-[state=open]:bg-primary` y `h-(--radix-select-trigger-height)`)
- [X] T006 [P] Configurar Vitest en `vitest.config.ts` (entorno node, alias `@/`, `tests/unit/**/*.test.ts(x)`)
- [X] T007 [P] Configurar Playwright en `playwright.config.ts`: proyectos `mobile-360` (360×800) y `desktop` (1280×800), cada uno en `colorScheme` light y dark, que excluyen las pruebas `@global` con `grepInvert`; proyecto `global` (desktop, light) que solo ejecuta las pruebas `@global` (`grep`), con `dependencies` en los 4 anteriores (corre después de ellos) y `fullyParallel: false` (ver "Listados y agregados globales" en Path Conventions); `webServer` con `pnpm build && pnpm start`; `baseURL` desde `NEXT_PUBLIC_SITE_URL`
- [X] T008 [P] Inicializar Supabase CLI y configurar `supabase/config.toml`: `enable_signup = false`, MFA TOTP enroll/verify habilitado, `minimum_password_length = 10`, `otp_expiry = 3600`, `jwt_expiry = 3600`, `[auth.hook.send_email]` con `env(SEND_EMAIL_HOOK_URI)`/`env(SEND_EMAIL_HOOK_SECRET)` (contracts/emails.md), `site_url` y `additional_redirect_urls` (`/auth/confirm`), `[auth.email] max_frequency = "1s"` y `[auth.rate_limit] email_sent` ≥ 30/h (para que gobierne el límite propio de 3 recuperaciones/correo/hora del Send Email Hook), límites nativos `sign_in_sign_ups` y `token_verifications` holgados en local/CI (la suite e2e llega a Auth siempre desde 127.0.0.1; los valores estrictos de research.md §R9 se configuran en staging/producción en T178), SMTP local a Mailpit (puerto 54325)
- [X] T009 [P] Crear `.env.example` con todas las variables de research.md §R22 (incluidas `NEXT_PUBLIC_SUPPORT_EMAIL` y `E2E_EMAIL_FAIL_DOMAIN`, esta última marcada "solo pruebas"), marcando cuáles son públicas (`NEXT_PUBLIC_*`) y cuáles solo servidor
- [X] T010 Añadir scripts a `package.json`: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:reset`, `db:test`, `check:bundle-secrets`, `lhci`, `email:dev`
- [X] T011 [P] Crear `.github/workflows/ci.yml` con jobs `lint`, `typecheck` y `unit` (Node 24, caché de pnpm)
- [ ] T178 Aprovisionar producción (research.md §R22; sin staging): proyecto Supabase de producción (signup off, MFA TOTP, `pg_cron`, URLs de redirección, `max_frequency` y `email_sent` replicados de `supabase/config.toml`; en el dashboard, límites nativos `sign_in_sign_ups` y `token_verifications` estrictos por IP según research.md §R9, no los holgados de local/CI); proyecto Vercel vinculado al repo (solo producción desde `main`; preview deployments deshabilitadas en el proyecto, porque no tendrían base de datos) con las variables de `.env.example` en Production; dominio verificado en Resend (SPF/DKIM/DMARC en SiteGround). Documentar el procedimiento en `README.md`. El `db push` y el hook de correo se configuran en T180, cuando existen las migraciones y la ruta del hook
  - Estado 2026-11-24: Supabase de producción (`lhcpemruivoygazgphup`, registro deshabilitado, migraciones y documentos legales `0.1-borrador`) y variables de Vercel listos. Pendiente: Resend (dominio verificado, `SMTP_PASS` y `EMAIL_FROM` definitivo), diferido al cierre del proyecto.

**Checkpoint**: `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm supabase start` funcionan en un proyecto vacío.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema completo con RLS, capas de autorización, seguridad, tokens de diseño y componentes
base que usan todas las historias.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta completar esta fase.

### Base de datos (migraciones, cada una con plan de rollback en el encabezado — Principio VII)

- [X] T012 Crear `supabase/migrations/20261123000100_extensions_and_enums.sql`: esquema `private` (sin `USAGE` para `anon`/`authenticated`), extensiones `pgcrypto`, `pg_cron` y `unaccent`, y todos los tipos de data-model.md → "Tipos enumerados" (`organization_type`, `organization_status`, `org_role`, `membership_status`, `email_send_status`, `access_request_status`, `legal_document_kind`, `onboarding_status`, `audit_actor_type`, `audit_result`, `ai_task`)
- [X] T013 Crear `supabase/migrations/20261123000200_core_tables.sql` con columnas, CHECK, FK e índices según data-model.md: `organizations.id`, `organizations.type`, `organizations.name`, `organizations.slug`, `organizations.sector`, `organizations.timezone`, `organizations.status`, `organizations.suspended_reason`, `organizations.suspended_at`, `organizations.suspended_by`, `organizations.created_at`, `organizations.updated_at`; `profiles.user_id`, `profiles.email`, `profiles.full_name`, `profiles.timezone`, `profiles.onboarding_status`, `profiles.onboarding_step`, `profiles.onboarding_updated_at`, `profiles.created_at`, `profiles.updated_at`; `platform_admins.user_id`, `platform_admins.created_at`, `platform_admins.created_by_label`; `memberships.id`, `memberships.organization_id`, `memberships.user_id`, `memberships.roles`, `memberships.status`, `memberships.invited_at`, `memberships.joined_at`, `memberships.created_at`, `memberships.updated_at`; `teams.id`, `teams.organization_id`, `teams.name`, `teams.manager_user_id`, `teams.created_at`, `teams.updated_at`; `quotas.organization_id`, `quotas.daily_limit`, `quotas.monthly_limit`, `quotas.updated_at`, `quotas.updated_by`; `ai_usage.id`, `ai_usage.organization_id`, `ai_usage.user_id`, `ai_usage.task`, `ai_usage.model`, `ai_usage.simulation_id`, `ai_usage.input_tokens`, `ai_usage.output_tokens`, `ai_usage.latency_ms`, `ai_usage.estimated_cost_usd`, `ai_usage.created_at`. Validación de zona horaria contra `pg_timezone_names` mediante función `private.is_valid_timezone(text)` usada en CHECK/trigger; CHECK `private.is_valid_timezone(timezone)` también en `profiles.timezone`
- [X] T014 Crear `supabase/migrations/20261123000300_platform_tables.sql` según data-model.md: `legal_documents.id`, `legal_documents.kind`, `legal_documents.version`, `legal_documents.effective_at`, `legal_documents.is_draft`, `legal_documents.content_path`, `legal_documents.created_at`; `legal_acceptances.id`, `legal_acceptances.user_id`, `legal_acceptances.document_id`, `legal_acceptances.accepted_at`; `invitations.id`, `invitations.email`, `invitations.target_organization_id`, `invitations.roles`, `invitations.invited_by`, `invitations.token_hash`, `invitations.expires_in_days`, `invitations.expires_at`, `invitations.last_sent_at`, `invitations.send_status`, `invitations.send_attempts`, `invitations.accepted_at`, `invitations.accepted_user_id`, `invitations.revoked_at`, `invitations.revoked_by`, `invitations.access_request_id`, `invitations.idempotency_key`, `invitations.resend_idempotency_key`, `invitations.created_at`, `invitations.updated_at`; `access_requests.id`, `access_requests.full_name`, `access_requests.email`, `access_requests.company_or_role`, `access_requests.message`, `access_requests.privacy_document_id`, `access_requests.privacy_accepted_at`, `access_requests.status`, `access_requests.invitation_id`, `access_requests.reviewed_by`, `access_requests.reviewed_at`, `access_requests.discarded_at`, `access_requests.discarded_by_system`, `access_requests.anonymized_at`, `access_requests.created_at`, `access_requests.updated_at`; `audit_logs.id`, `audit_logs.occurred_at`, `audit_logs.actor_type`, `audit_logs.actor_user_id`, `audit_logs.actor_label`, `audit_logs.organization_id`, `audit_logs.action`, `audit_logs.object_type`, `audit_logs.object_id`, `audit_logs.data`, `audit_logs.result`; `private.rate_limit_events.id`, `private.rate_limit_events.scope`, `private.rate_limit_events.key_hash`, `private.rate_limit_events.occurred_at`. La FK circular `invitations.access_request_id` ↔ `access_requests.invitation_id` se añade con `ALTER TABLE` al final; incluir índices únicos parciales e índices listados en data-model.md
- [X] T015 Crear `supabase/migrations/20261123000400_triggers.sql` (contracts/database-rpc.md → Triggers): `set_updated_at` en toda tabla con `updated_at`; `after insert on auth.users` → crea `profiles` (con `profiles.email` normalizado); `after update of email on auth.users` → sincroniza `profiles.email`; `before update or delete on audit_logs` → excepción; `before update or delete on legal_documents` → excepción si `legal_documents.effective_at <= now()`; `before insert or update on memberships` → en org `personal`, `memberships.roles = '{vendedor}'` y como máximo una pertenencia; `before update on profiles` → excepción si `profiles.full_name` pasa de no nulo a NULL; `before update of onboarding_status, onboarding_step on profiles` → `profiles.onboarding_updated_at = now()` si alguno cambia
- [X] T016 Crear `supabase/migrations/20261123000500_rls_helpers.sql`: `private.current_session_ok()`, `private.is_superadmin()`, `private.active_org_ids()`, `private.has_org_role(uuid, org_role)`, `private.is_operative_user()` (`security definer`, `stable`, `search_path = ''`) con la lógica de data-model.md → "Funciones helper de RLS" y research.md §R7 (30 días / 7 días de inactividad / 12 h superadmin, `aal2` desde `auth.jwt()`)
- [X] T017 Crear `supabase/migrations/20261123000600_rls_policies_and_grants.sql`: `ENABLE ROW LEVEL SECURITY` en todas las tablas de `public` y `private`; políticas de data-model.md → "Políticas RLS (resumen)" con helpers envueltos en `(select …)`; `REVOKE ALL` a `anon`/`authenticated` y grants explícitos (incluido `GRANT UPDATE (onboarding_status, onboarding_step)` sobre `profiles`, con política UPDATE propia ∧ `private.is_operative_user()`, y `SELECT` de `anon` solo en `legal_documents`)
- [X] T018 Crear `supabase/migrations/20261123000700_core_functions.sql` (contracts/database-rpc.md): `public.invitation_status(...)` (`stable`, `security invoker`); `private.write_audit(...)` interna y `public.write_audit(...)` solo `service_role`, que validan `audit_logs.action` contra el catálogo de data-model.md#audit-actions y `audit_logs.data` contra su lista blanca de claves; `public.get_request_context()` para `authenticated` con el `jsonb` del contrato
- [X] T019 Crear `supabase/migrations/20261123000800_rate_limit.sql`: `private.check_rate_limit`, `private.record_rate_limit_event`, `private.purge_rate_limit_events` + job `pg_cron` diario; como `private` no se expone por PostgREST, añadir envoltorios `public.check_rate_limit` / `public.record_rate_limit_event` con `EXECUTE` solo para `service_role` (research.md §R9)
- [X] T020 [P] Redactar borradores legales versionados `content/legal/terminos-0.1-borrador.md`, `content/legal/aviso-ia-0.1-borrador.md` y `content/legal/privacidad-0.1-borrador.md` (subconjunto Markdown: títulos, párrafos, listas, enlaces)
- [X] T021 Crear `supabase/seed.sql` (data-model.md → "Seed de desarrollo"): tres `legal_documents` `0.1-borrador` (`legal_documents.version`, `legal_documents.is_draft`, `legal_documents.content_path` apuntando a T020); dos superadmins de prueba (uno con factor TOTP de secreto conocido y otro sin factor, para US4); orgs personales A y B con un vendedor activo cada una (`onboarding_status = completed`), cuotas por defecto y filas de `ai_usage`; org personal C con su vendedor C (`onboarding_status = pending`, para US8 y el destino `/onboarding`); org personal D `suspended` (con `organizations.suspended_reason`) y su vendedor D (para T064 y T147); org personal E `active` con su vendedor E y pertenencia `memberships.status = 'suspended'` (para T025 y T064, FR-024); solicitudes en los tres estados; una invitación por estado con `invitations.token_hash = sha256(token conocido)`. Documentar todas las credenciales, el secreto TOTP y los tokens en `tests/e2e/fixtures/seed-data.ts`

### Pruebas de base de datos fundacionales (pgTAP)

- [X] T022 [P] Prueba guardiana `supabase/tests/database/00_rls_guardian.test.sql`: toda tabla de `public` y `private` con RLS activo; toda tabla de `public` fuera de la lista de plataforma de data-model.md → "Clasificación de tablas" tiene `organization_id NOT NULL`, FK e índice con prefijo `organization_id`; `anon` sin privilegios salvo `SELECT` en `legal_documents`
- [X] T023 [P] Prueba de restricciones `supabase/tests/database/01_schema_constraints.test.sql`: patrón y longitud de `organizations.slug`, `organizations.suspended_reason` obligatorio y no solo espacios al suspender (`'   '` rechazado), `quotas.daily_limit <= quotas.monthly_limit`, `invitations` no aceptada y revocada a la vez, índice parcial de invitación abierta por correo, `access_requests.anonymized_at` ⇒ datos personales nulos, `profiles.full_name` no solo espacios, `profiles.onboarding_step` 1–3, trigger de `memberships` en org personal, `profiles.timezone` inválida rechazada, `profiles.full_name` no vuelve a NULL, cambiar `profiles.onboarding_step` o `profiles.onboarding_status` fija `profiles.onboarding_updated_at` (y otro UPDATE no lo toca)
- [X] T024 [P] Prueba de política de sesión `supabase/tests/database/02_session_policy.test.sql`: `private.current_session_ok()` con filas simuladas de `auth.sessions` (vendedor > 30 días, > 7 días sin refresh, superadmin > 12 h → false); `private.is_superadmin()` false con `aal1`
- [X] T025 [P] Suite de aislamiento A/B `supabase/tests/database/03_isolation_ab.test.sql` (AC-01, FR-005): con JWT simulado del vendedor A, cero filas de B y rechazo de INSERT/UPDATE/DELETE en `organizations`, `memberships`, `teams`, `quotas`, `ai_usage`; org suspendida → cero filas incluso propias; pertenencia suspendida en org activa (vendedor E sembrado) → cero filas de su org y `private.is_operative_user()` false
- [X] T026 [P] Prueba de auditoría `supabase/tests/database/04_audit_immutability.test.sql`: UPDATE/DELETE de `audit_logs` lanzan excepción (incluso `service_role`); `authenticated` no puede insertar; `write_audit` rechaza acciones fuera del catálogo y claves fuera de la lista blanca
- [X] T027 [P] Prueba de rate limiting `supabase/tests/database/05_rate_limit.test.sql`: `check_rate_limit` permite hasta el máximo, devuelve `retry_after_seconds` correcto en bloqueo, ignora eventos fuera de la ventana; `authenticated`/`anon` sin `EXECUTE`
- [X] T028 Añadir job `db` a `.github/workflows/ci.yml` (`supabase start` → `supabase db reset` → `supabase test db`)

### Infraestructura del servidor

- [X] T029 [P] Crear `src/lib/env.ts` (`server-only`, valida con Zod las variables de servidor de research.md §R22; rechaza `E2E_EMAIL_FAIL_DOMAIN` si `NODE_ENV` o `VERCEL_ENV` es `production`) y `src/lib/env.public.ts` (solo `NEXT_PUBLIC_*`)
- [X] T030 [P] Crear clientes Supabase: `src/lib/supabase/server.ts` (sesión del usuario vía cookies), `src/lib/supabase/admin.ts` (`server-only`, clave secreta, sin persistencia de sesión) y `src/lib/supabase/proxy.ts` (refresco de sesión para `proxy.ts`)
- [X] T031 [P] Crear `src/lib/action-result.ts` (tipo `ActionResult<T>`, catálogo cerrado `ErrorCode` de research.md §R17, mensajes en español, mapeo de `ERRCODE` Postgres → `ErrorCode` de contracts/database-rpc.md (incluido `23505` → `conflict`), id de correlación para `unexpected` enviado a Sentry)
- [X] T032 [P] Crear `src/lib/security/hmac.ts` (HMAC-SHA256 con `RATE_LIMIT_PEPPER`; firma/verificación de marcas de tiempo) y `src/lib/security/tokens.ts` (token de 32 bytes base64url = 43 caracteres y `sha256` a `bytea`, research.md §R4)
- [X] T033 Crear `src/lib/security/rate-limit.ts`: tabla de ámbitos de research.md §R9 (`login_account`, `login_ip`, `mfa_verify`, `recovery_email`, `activation_ip`, `access_request_ip`, `webhook_id`, `user_mutation`), `check`/`record` vía cliente administrativo y `public.check_rate_limit`, extracción de IP de `x-real-ip`/`x-forwarded-for`, mensaje "Vuelve a intentarlo en N minutos" (depende de T019, T030, T032)
- [X] T034 [P] Crear `src/lib/security/password-policy.ts` (`server-only`: mínimo 10, distinta del correo y su parte local, lista local `src/lib/security/common-passwords.txt` top 10.000 de SecLists, HIBP por rango con `Add-Padding` y tiempo límite 1,5 s fail-open con métrica sin PII) y `src/lib/security/password-rules.ts` (reglas espejo para el indicador en cliente, sin la lista), research.md §R6
- [X] T035 Crear `src/lib/audit.ts`: envoltorio tipado de `rpc write_audit` con unión del catálogo de acciones y tipos de `data` por acción (data-model.md#audit-actions); nunca acepta contraseñas, códigos, tokens ni enlaces
- [X] T036 Crear `src/lib/auth/request-context.ts` (`getRequestContext()` con `React.cache` → `rpc get_request_context`; si `session_ok = false`, `signOut()` y redirección a `/iniciar-sesion?next=…`) y `src/lib/auth/session-policy.ts` (constantes 30 d / 7 d / 12 h espejo de la BD)
- [X] T037 Crear `src/lib/auth/guards.ts`: `requireUser()`, `requireOperativeUser()` (pertenencia operativa o superadmin `aal2`), `requireOrgMember(orgId, roles?)`, `requireSuperadmin()` (exige `aal2`); variantes para Server Actions (devuelven `ActionResult` `forbidden` y aplican `user_mutation` antes de devolver el contexto) y para páginas (renderizan "sin permiso" o redirigen a `/mfa/*`), research.md §R3
- [X] T038 [P] Crear `src/lib/auth/destination.ts` (destino tras iniciar sesión según contracts/routes.md → "Destino tras iniciar sesión") y `src/lib/auth/safe-next.ts` (solo rutas internas, rechaza `//`, esquemas y `\`)
- [X] T039 [P] Crear `src/lib/format.ts` (`Intl.DateTimeFormat('es-PE', { timeZone })`, `Intl.NumberFormat('es-PE')`, moneda `US$`) y `src/lib/initials.ts` (`Intl.Segmenter`, máx. 2 grafemas, respaldo "?"), research.md §R14, §R18
- [X] T040 Crear `src/proxy.ts`: refresco de sesión, nonce por petición y CSP estricta, HSTS, `X-Content-Type-Options`, `Referrer-Policy` (`no-referrer` en `/invitacion/*` y `/auth/confirm`), `Permissions-Policy` y redirecciones optimistas de rutas `(app)` sin sesión a `/iniciar-sesion?next=…` (research.md §R19)
- [X] T041 [P] Configurar Sentry: `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`, `withSentryConfig` en `next.config.ts` y `src/lib/observability/scrub.ts` (`sendDefaultPii: false`; `beforeSend`/`beforeBreadcrumb` eliminan correos, cuerpos de formularios, cookies, segmentos de `/invitacion/*` y `token_hash`), research.md §R21
- [X] T042 [P] Crear infraestructura de correo: `src/lib/email/transport.ts` (`server-only`, nodemailer SMTP desde env), `src/lib/email/send.ts` (render de React Email a HTML + texto plano, envío, nunca registra URLs ni tokens; si `E2E_EMAIL_FAIL_DOMAIN` está definida, los destinatarios de ese dominio —p. ej., `falla-envio.test`— provocan un error SMTP simulado) y `src/emails/components/email-layout.tsx` (marca, pie "Creando Valor IA™ — Cautiva Marketing", `color-scheme: light dark`, 600 px, contracts/emails.md → Reglas comunes)

### Design system: tokens, tema y componentes base compartidos

- [X] T043 Crear `src/styles/tokens.css`: tokens semánticos de color en hex sRGB para `:root, .light` y `.dark` (lista de research.md §R14, incluidos `avatar-1…6`/`on-avatar-1…6` y `accent-strong`), escala tipográfica fluida, espaciado base 4 px, radios, elevación por tema y motion (0 ms bajo `prefers-reduced-motion`); exponer con `@theme inline` y `--color-*: initial`. Completar `src/styles/globals.css` con estilos base, anillo de foco visible y mínimo de 44 px para objetivos táctiles
- [X] T044 [P] Crear `src/lib/contrast.ts` (luminancia relativa y ratio WCAG), `src/styles/token-pairs.ts` (lista declarada de pares texto/fondo y componente/fondo por tema con umbral 4,5:1 o 3:1) y la prueba `tests/unit/tokens-contrast.test.ts` que lee `tokens.css` y exige AA en ambos temas (SC-009, FR-042)
- [X] T045 Crear `src/app/layout.tsx` y `src/components/providers.tsx`: `<html lang="es" suppressHydrationWarning>`, Bricolage Grotesque y Figtree con `next/font/google` (variables, `latin`, `display: swap`, `adjustFontFallback`), `ThemeProvider` de next-themes (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, nonce de la CSP), `Toaster`, `MotionConfig reducedMotion="user"`, Vercel Analytics y Speed Insights (research.md §R16)
- [X] T046 [P] Crear `src/lib/utils.ts` con `cn()` (clsx + tailwind-merge configurado con las escalas de tokens propias)
- [X] T047 [P] Crear `src/components/ui/button.tsx` (variantes primary, secondary, accent, ghost, destructive, link; tamaños sm, md, lg, icon; `loading` con `aria-busy` y deshabilitado; mínimo 44 px)
- [X] T048 [P] Crear `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx` (autoajustable con `field-sizing: content` y respaldo JS), `src/components/ui/label.tsx` y `src/components/ui/form-field.tsx` (etiqueta, descripción y error con `aria-describedby`/`aria-invalid`)
- [X] T049 [P] Crear `src/components/ui/checkbox.tsx` y `src/components/ui/select.tsx` (Radix, con tokens)
- [X] T050 [P] Crear `src/components/ui/badge.tsx`, `src/components/ui/card.tsx`, `src/components/ui/skeleton.tsx` y `src/components/ui/empty-state.tsx`
- [X] T051 [P] Crear `src/components/ui/table.tsx` responsive (tabla ≥ 640 px; lista de tarjetas `<dl>` en móvil, sin scroll horizontal de página)
- [X] T052 [P] Crear `src/components/ui/dialog.tsx`, `src/components/ui/dropdown-menu.tsx` (con radio items) y `src/components/ui/sonner.tsx` (toast con `aria-live`)
- [X] T053 [P] Crear componentes de estado `src/components/states/forbidden.tsx` (no revela existencia del recurso), `src/components/states/error-state.tsx` (Reintentar + id de referencia) y `src/components/states/page-skeleton.tsx`
- [X] T054 Crear páginas globales `src/app/not-found.tsx`, `src/app/error.tsx` y `src/app/global-error.tsx` con la marca, camino de regreso, "Reintentar" e id de referencia, sin trazas (FR-039, FR-040)
- [X] T055 Crear layouts de control de acceso: `src/app/(app)/layout.tsx` mínimo (llama a `getRequestContext()`; superadmin `aal1` → `/mfa/verificar` o `/mfa/registrar`; sin pertenencia operativa y no superadmin → `/acceso-suspendido`; `<main id="contenido">`), `src/app/(app)/admin/layout.tsx` (`requireSuperadmin()` → `Forbidden` con HTTP 403) y `src/app/(app)/admin/page.tsx` (redirige a `/admin/invitaciones`)

### Pruebas unitarias fundacionales e infraestructura e2e

- [X] T056 [P] Pruebas Vitest de utilidades en `tests/unit/lib/`: `initials.test.ts` ("Ñandú" → "Ñ", emoji, un carácter, vacío → "?"), `format.test.ts`, `safe-next.test.ts`, `destination.test.ts`, `action-result.test.ts` (mapeo de ERRCODE), `hmac.test.ts`, `tokens.test.ts` (43 caracteres, hash estable)
- [X] T057 [P] Pruebas Vitest de seguridad en `tests/unit/security/password-policy.test.ts` (mínimo, igual al correo/parte local, lista común, HIBP simulado incluido timeout fail-open) y `tests/unit/security/rate-limit.test.ts` (mensaje y cálculo de minutos; ámbito `user_mutation`; las variantes de Server Action de los guards de T037 consultan `user_mutation` antes de devolver el contexto, incluido su uso en `resetPassword` y `enrollMfa`, y `signOut` no lo consulta; la tabla de ámbitos de `rate-limit.ts` coincide con research.md §R9 en límites, ventanas y bloqueos)
- [X] T058 [P] Prueba Vitest `tests/unit/observability/scrub.test.ts`: `beforeSend` elimina correos, cuerpos, cookies, `/invitacion/<token>` y `token_hash`
- [X] T059 [P] Crear fixtures e2e en `tests/e2e/fixtures/`: `totp.ts` (RFC 6238 con `node:crypto`, sin dependencia nueva), `mailpit.ts` (API HTTP: último mensaje por destinatario, extracción de enlaces, HTML y texto), `auth.ts` (inicio de sesión de vendedor A/B y superadmin `aal2` con `storageState`, solo lectura), `axe.ts` (falla con violaciones `serious`/`critical`), `factories.ts` (solo pruebas; cliente administrativo con la clave secreta: crea por prueba vendedores con org personal y cuota, superadmins con o sin factor TOTP de secreto conocido, invitaciones en cualquier estado con token conocido, orgs suspendidas y solicitudes de acceso en cualquier estado, con correos únicos `<prefijo>+<uuid>@ejemplo.test` y nombres de organización únicos; nunca crea filas de `ai_usage`) y `network.ts` (`uniqueClientIp()` fija un `x-forwarded-for` único por prueba vía `extraHTTPHeaders` del contexto; `fixedClientIp(testInfo)` para las pruebas de límites por IP: una IP estable durante toda la prueba —todas sus peticiones salen de ella— y distinta entre pruebas y proyectos, derivada de `testInfo.testId` y `testInfo.project.name`, para que los 4 proyectos no compartan contador). Aplica la "Regla de datos e2e" de Path Conventions: los datos de T021 son de solo lectura y toda prueba que muta estado usa factorías
- [X] T060 Crear `scripts/ci/check-bundle-secrets.mjs` (busca en `.next/static` los valores de `SUPABASE_SECRET_KEY`, `SMTP_PASS`, `RATE_LIMIT_PEPPER`, `SEND_EMAIL_HOOK_SECRET` y el patrón `sb_secret_`) y añadir el job `build` + `bundle-secrets` a `.github/workflows/ci.yml`

**Checkpoint**: `supabase db reset` + `supabase test db` en verde; `pnpm test` en verde; la app arranca con
tema sin parpadeo, CSP activa y rutas `(app)` protegidas.

---

## Phase 3: User Story 3 - Inicio y cierre de sesión, recuperación, sin registro abierto (Priority: P1)

**Goal**: Usuarios existentes entran, salen, recuperan su contraseña y la sesión persiste según FR-019;
no hay registro abierto.

**Independent Test**: con el vendedor A sembrado: iniciar sesión, cerrar el navegador y volver (sigue
dentro), cerrar sesión (rutas privadas redirigen), solicitar recuperación, recibir el correo en Mailpit y
definir una contraseña nueva; 5 fallos seguidos frenan el inicio de sesión.

### Tests for User Story 3 ⚠️

- [X] T061 [P] [US3] Prueba Vitest `tests/unit/auth/schemas.test.ts` para los esquemas de `signIn`, `requestPasswordReset`, `resetPassword` y `authConfirmParams` (contracts/server-actions.md; `type` distinto de `recovery`, `token_hash` con caracteres no base64url y `next` externo se rechazan)
- [X] T062 [P] [US3] Prueba Vitest `tests/unit/emails/password-recovery.test.ts`: asunto en español, HTML y texto contienen el enlace `/auth/confirm?...type=recovery` y "60 minutos"
- [X] T063 [P] [US3] Prueba Vitest `tests/unit/api/send-email-hook.test.ts`: firma inválida o timestamp fuera de 5 min → 401; tipo distinto de `recovery` → 400; límite excedido → 200 sin envío y sin registrar evento; éxito → 200 y registra exactamente un evento `recovery_email`; mismo `webhook-id` dos veces → el segundo responde 200 sin envío; fallo SMTP → 500 con el cuerpo del contrato (contracts/emails.md)
- [X] T064 [P] [US3] Prueba e2e `tests/e2e/auth-session.spec.ts`: éxito y destino (vendedor A sembrado → `/inicio`, solo lectura), error genérico (correo inexistente y contraseña errónea iguales), persistencia al reabrir contexto, cierre de sesión, bloqueo tras 5 fallos con minutos de reintento (vendedor creado con la factoría de T059, nunca uno sembrado), 20 fallos desde la misma IP (`fixedClientIp` propia de esta prueba) con correos únicos distintos → el 21.º se frena; el resto de casos usa `uniqueClientIp()`, `?next=` externo ignorado, ruta privada con sesión expirada → tras iniciar sesión vuelve a `next`, vendedor D de la org suspendida sembrada → `/acceso-suspendido`, vendedor E con pertenencia suspendida sembrada → `/acceso-suspendido`, axe
- [X] T065 [P] [US3] Prueba e2e `tests/e2e/password-recovery.spec.ts` (vendedor creado con la factoría de T059, correo único por prueba e `uniqueClientIp()`; nunca un usuario sembrado): misma confirmación para correo existente e inexistente, un solo correo en Mailpit, restablecer contraseña cierra otras sesiones (FR-021), enlace usado/vencido → mensaje y opción de pedir otro, la 1.ª, 2.ª y 3.ª solicitud en una hora generan exactamente un correo cada una; la 4.ª no genera correo y muestra la misma confirmación
- [X] T066 [P] [US3] Prueba e2e `tests/e2e/open-signup.spec.ts`: no existe UI de registro y `auth.signUp` con la clave publicable es rechazado (FR-022)

### Implementation for User Story 3

- [X] T067 [P] [US3] Crear esquemas Zod `src/features/auth/schemas.ts` (`signIn`, `requestPasswordReset`, `resetPassword`; correo normalizado con `trim().toLowerCase()`; `authConfirmParams` para la query de `/auth/confirm`: `token_hash` con `^[A-Za-z0-9_-]{1,256}$`, `type: z.literal('recovery')`, `next` opcional validado con `safe-next.ts`)
- [X] T068 [US3] Implementar `src/features/auth/actions.ts`: `signIn` (rate limit `login_account` + `login_ip` antes de Auth, solo los fallos registran evento, verifica pertenencia/superadmin, redirige con `destination.ts`), `signOut` (`scope: 'local'`), `requestPasswordReset` (consulta `recovery_email` sin registrar evento; respuesta siempre igual), `resetPassword` (guard: variante de Server Action de `requireUser()` sobre la sesión de recuperación, que aplica `user_mutation`; política de contraseñas, `updateUser`, `signOut({ scope: 'others' })`); `signOut` es la única action sin rate limit (contracts/server-actions.md)
- [X] T069 [P] [US3] Crear plantilla `src/emails/password-recovery.tsx` (`PasswordRecoveryEmail`, contracts/emails.md)
- [X] T070 [US3] Implementar el Send Email Hook en `src/app/api/auth/send-email/route.ts` (runtime Node; verificación `standardwebhooks` con tolerancia de 5 min, deduplicación por `webhook-id`, Zod, solo `recovery`, rate limit `recovery_email`, render + envío, respuestas del contrato)
- [X] T071 [P] [US3] Implementar `src/app/auth/confirm/route.ts`: valida la query con `authConfirmParams` (Zod) antes de llamar a Auth; parámetros inválidos → `/recuperar-contrasena?estado=enlace-invalido`; si validan, `verifyOtp(token_hash, type=recovery)` → `/restablecer-contrasena`; inválido/vencido → `/recuperar-contrasena?estado=enlace-invalido`
- [X] T072 [P] [US3] Crear `src/features/auth/components/password-requirements.tsx` (indicador en tiempo real con `password-rules.ts`, `aria-live="polite"`; reutilizado en US2)
- [X] T073 [US3] Crear `src/app/(auth)/layout.tsx` (marca centrada; rutas "A" con sesión válida redirigen al destino) y `src/app/(auth)/iniciar-sesion/page.tsx` con `src/features/auth/components/sign-in-form.tsx` (`useActionState`, envío deshabilitado mientras `pending`, mensaje de reintento, `next`, enlace a recuperar; el enlace a "Solicitar acceso" lo añade T161 cuando existe la ruta). Crear también una landing provisional `src/app/(public)/page.tsx` (marca + "Iniciar sesión", sin enlaces a rutas que aún no existen), que T160 reemplaza
- [X] T074 [P] [US3] Crear `src/app/(auth)/recuperar-contrasena/page.tsx` con `src/features/auth/components/request-reset-form.tsx` (confirmación genérica; mensaje para `estado=enlace-invalido`)
- [X] T075 [P] [US3] Crear `src/app/(auth)/restablecer-contrasena/page.tsx` con `src/features/auth/components/reset-password-form.tsx` (exige sesión de recuperación; indicador de requisitos)
- [X] T076 [P] [US3] Crear `src/app/(auth)/acceso-suspendido/page.tsx` (mensaje explicativo, medio de contacto `NEXT_PUBLIC_SUPPORT_EMAIL` y cerrar sesión, FR-024)
- [X] T077 [P] [US3] Crear `src/app/(app)/inicio/page.tsx` mínimo (saludo y aviso "La práctica llega pronto") con `loading.tsx` y `error.tsx` (se amplía en US8)
- [X] T078 [US3] Añadir a `src/app/(app)/layout.tsx` una cabecera mínima con la marca y botón "Cerrar sesión" (formulario a `signOut`), reemplazada por el menú de cuenta en US5
- [ ] T180 [US3] Desplegar en producción (depende de T178 y T070): aplicar las migraciones (nunca `seed.sql`), configurar el Send Email Hook de producción (URI del dominio + secreto) y verificar que un correo de recuperación llega con la marca. Nota: aplicar las migraciones nuevas antes de desplegar cada cambio que las necesite
  - Estado 2026-11-24: migraciones aplicadas y primer despliegue de `main` en `https://creando-valor-ia-academity.vercel.app`. Pendiente: verificar la llegada del correo de recuperación (requiere Resend).

**Checkpoint**: US3 funcional y probada de forma independiente con usuarios sembrados.

---

## Phase 4: User Story 4 - El superadministrador entra solo con MFA (TOTP) (Priority: P1)

**Goal**: Ningún superadmin accede a administración sin `aal2`; registro y verificación de TOTP auditados;
procedimiento operativo de alta y de reset de MFA.

**Independent Test**: superadmin sembrado sin factor solo ve `/mfa/registrar`; tras registrar, cada inicio
exige código; con `aal1` cualquier ruta/acción admin se rechaza; `audit_logs` contiene `superadmin.login`.

### Tests for User Story 4 ⚠️

- [X] T079 [P] [US4] Prueba pgTAP `supabase/tests/database/12_superadmin_aal.test.sql`: `get_request_context()` informa `aal`, `is_superadmin_account` y `has_verified_factor`; `private.is_superadmin()` solo con `aal2`; `revoke_user_sessions` elimina las sesiones y solo la ejecuta `service_role`
- [X] T080 [P] [US4] Prueba e2e `tests/e2e/superadmin-mfa.spec.ts`: superadmin sin factor (factoría) → solo `/mfa/registrar` y cerrar sesión (otras rutas redirigen); registro con el secreto mostrado; 5 códigos erróneos en el registro → bloqueo 15 min y filas `superadmin.login` failure con `step: 'mfa_enroll'`; `aal1` → `/mfa/verificar`; código erróneo → error; 5 fallos → bloqueo 15 min; invocar una Server Action admin con `aal1` → rechazada; rutas `/admin/*` y `/design` con `aal1` → redirección a `/mfa/verificar`; filas `superadmin.login` (success/failure) y `superadmin.mfa_enrolled`. Usa un superadmin sin factor y otro con factor de secreto conocido creados con la factoría de T059 (nunca los sembrados, que otras pruebas usan para `aal2`) e `uniqueClientIp()`
- [X] T182 [P] [US4] Prueba Vitest `tests/unit/auth/mfa-schemas.test.ts` (Principio II): `code` rechaza 5 o 7 dígitos, letras y espacios; `factorId` no uuid rechazado; `next` externo, `//`, esquemas y `\` rechazados
- [X] T181 [P] [US4] Prueba e2e `tests/e2e/superadmin-mfa-reset.spec.ts` (FR-027a, SC-010): con una sesión `aal2` abierta de un superadmin con factor creado con la factoría de T059 (nunca el sembrado), ejecuta `pnpm tsx scripts/ops/reset-superadmin-mfa.ts --email … --operator ci` contra Supabase local y verifica: 0 factores, sesiones revocadas (la sesión previa es rechazada en su siguiente petición), exactamente un `superadmin.mfa_reset` con `actor_type = operator` y `actor_label = 'ci'`, y el siguiente inicio de sesión exige `/mfa/registrar`

### Implementation for User Story 4

- [X] T081 [US4] Crear `supabase/migrations/20261123001000_superadmin_ops.sql`: `private.revoke_user_sessions(uuid)` y envoltorio `public.revoke_user_sessions` solo `service_role`
- [X] T082 [P] [US4] Crear esquemas `src/features/auth/mfa-schemas.ts` (`code: /^\d{6}$/`, `factorId`, `next` interno)
- [X] T083 [US4] Implementar `src/features/auth/mfa-actions.ts`: `enrollMfa` (guard: variante de Server Action de `requireUser()`, que aplica `user_mutation`, + superadmin `aal1` sin factor verificado; `issuer: 'Creando Valor IA'`, el secreto nunca se registra), `confirmMfaEnrollment` (rate limit `mfa_verify` compartido; `challengeAndVerify`; éxito: audita `superadmin.mfa_enrolled` + `superadmin.login` success con `step: 'mfa_enroll'` → `/admin/invitaciones`; fallo: registra evento `mfa_verify` y audita `superadmin.login` failure con `step: 'mfa_enroll'`), `verifyMfa` (rate limit `mfa_verify`, audita `superadmin.login` success/failure con `step: 'mfa_verify'` vía cliente administrativo), contracts/server-actions.md
- [X] T084 [P] [US4] Crear `src/app/(auth)/mfa/registrar/page.tsx` con `src/features/auth/components/mfa-enroll-form.tsx` (QR SVG como imagen con texto alternativo, clave manual copiable, campo `inputmode="numeric"` `autocomplete="one-time-code"`, única salida cerrar sesión)
- [X] T085 [P] [US4] Crear `src/app/(auth)/mfa/verificar/page.tsx` con `src/features/auth/components/mfa-verify-form.tsx` (mensaje de bloqueo con minutos)
- [X] T086 [P] [US4] Crear `scripts/ops/create-superadmin.ts` (tsx, clave secreta: crea usuario con contraseña aleatoria que no se muestra ni se guarda, `profiles.full_name` y fila `platform_admins` con `platform_admins.created_by_label` según data-model.md)
- [X] T087 [P] [US4] Crear `scripts/ops/reset-superadmin-mfa.ts` (`--email`, `--operator`: elimina factores con `auth.admin.mfa.deleteFactor`, llama a `revoke_user_sessions`, audita `superadmin.mfa_reset` con `actor_type = operator`, `audit_logs.actor_label` = operador y `{ sessions_revoked }`), FR-027a
- [X] T088 [P] [US4] Redactar el procedimiento operativo `scripts/ops/README.md` (quién puede ejecutarlo, variables, pasos, verificación en `audit_logs`, alta de superadmins; primer acceso: el superadmin define su contraseña en `/recuperar-contrasena` y luego registra TOTP)

**Checkpoint**: superadmin con `aal2` puede entrar a `/admin` (aún vacío); `aal1` nunca.

---

## Phase 5: User Story 1 - El superadministrador invita a un vendedor individual (Priority: P1) 🎯 MVP

**Goal**: Crear, listar, reenviar, revocar y reintentar invitaciones con correo de marca y auditoría.

**Independent Test**: superadmin `aal2` crea una invitación, el correo llega a Mailpit (HTML + texto), aparece
"pendiente"; se reenvía (enlace viejo inválido) y se revoca; cada cambio queda en estado y auditoría.

### Tests for User Story 1 ⚠️

- [X] T089 [P] [US1] Prueba pgTAP `supabase/tests/database/10_invitations_admin.test.sql`: `aal1` y no-superadmin → `42501` en todas las `admin_*` de invitaciones; `P0012` con `DETAIL` `account_exists` / `open_invitation:<id>` (correo normalizado; una invitación vencida también cuenta como abierta); una cuenta huérfana (usuario de Auth sin pertenencias ni `platform_admins`) NO produce `account_exists`; `invitation_status` devuelve `pending|accepted|expired|revoked`; reenviar solo desde pendiente/vencida reemplaza `token_hash`, reinicia `expires_at` y guarda `resend_idempotency_key`; misma clave de reenvío dos veces (también concurrente) → `duplicate = true`, mismo `token_hash` y un solo `invitation.resent`; clave nueva → nuevo reenvío; revocar solo desde pendiente/vencida; doble revocación → la segunda devuelve `duplicate = true` y hay un solo `invitation.revoked`; revocar una aceptada → `P0010`; `admin_mark_invitation_sent`; exactamente un registro de auditoría por acción; misma `idempotency_key` dos veces (también concurrente) → mismo id, `duplicate = true` y un solo `invitation.created`; convertir una solicitud → exactamente un `invitation.created` y un `access_request.converted`; filtros de `admin_list_invitations`
- [X] T090 [P] [US1] Pruebas Vitest `tests/unit/invitations/schemas.test.ts` (correo normalizado, plazo 1–30 por defecto 7; `resendInvitation` rechaza `invitationId` e `idempotencyKey` no uuid y `idempotencyKey` ausente; `revokeInvitation` rechaza `invitationId` no uuid (su idempotencia es por estado, sin clave); `convertibleRequestParam` rechaza `?solicitud` no uuid) y `tests/unit/emails/invitation.test.ts` (asunto, nombre de quien invita, fecha es-PE America/Lima, "{n} días", HTML y texto con enlace)
- [X] T091 [P] [US1] Prueba e2e `tests/e2e/invitations.spec.ts` (correos únicos por prueba e `uniqueClientIp()`; nunca invitaciones sembradas; cada fila se localiza con la búsqueda por el correo único de la prueba, nunca por posición o página): crear con plazo por defecto → correo en Mailpit y fila "pendiente"; duplicado con el correo de la prueba en mayúsculas y con espacios → rechazo con "Reenviar"; reenviar → enlace viejo inválido; doble clic en "Reenviar" del diálogo → un solo correo nuevo en Mailpit, un solo `invitation.resent` y el enlace recibido funciona; revocar; invitación vencida creada con la factoría de T059 → crear otra para el mismo correo se rechaza con "Reenviar" (FR-010) y reenviar la vuelve pendiente; las fechas del listado se muestran en la zona del perfil del superadmin (FR-036); fallo de envío simulado (destinatario `persona@falla-envio.test` con `E2E_EMAIL_FAIL_DOMAIN=falla-envio.test`) → aviso y "Reintentar envío"; doble envío rápido del formulario → una sola fila, un solo correo en Mailpit y confirmación (no error de conflicto); vendedor → "sin permiso"; axe

### Implementation for User Story 1

- [X] T092 [US1] Crear `supabase/migrations/20261123001100_invitation_admin_functions.sql` con `admin_list_invitations` (`p_status` ∈ `pending|accepted|expired|revoked` o NULL), `admin_create_invitation` (`account_exists` solo si la cuenta tiene alguna pertenencia o fila en `platform_admins`; las cuentas huérfanas no bloquean, data-model → "Cuenta huérfana"; `open_invitation` para invitaciones `pending` o `expired`), `admin_resend_invitation(p_invitation_id, p_token_hash, p_idempotency_key)` (devuelve `table(invitation_id, duplicate)`; `FOR UPDATE`; misma clave que `invitations.resend_idempotency_key` → `duplicate = true` sin cambios ni auditoría; si no, valida pendiente/vencida, reemplaza el token, reinicia el plazo, guarda la clave y audita), `admin_mark_invitation_sent`, `admin_revoke_invitation` (devuelve `table(invitation_id, duplicate)`; ya revocada → `duplicate = true` sin auditar; aceptada → `P0010`) (contracts/database-rpc.md), que mantienen `invitations.invited_by` (= `auth.uid()`), `invitations.email`, `invitations.expires_in_days`, `invitations.expires_at`, `invitations.token_hash`, `invitations.send_status`, `invitations.send_attempts`, `invitations.last_sent_at`, `invitations.revoked_at`, `invitations.revoked_by`, `invitations.access_request_id`, `invitations.idempotency_key`, `invitations.resend_idempotency_key` según data-model.md; `admin_create_invitation` recibe `p_idempotency_key` y devuelve `table(invitation_id, duplicate)` (clave existente → misma fila con `duplicate = true`, sin auditar; INSERT con `ON CONFLICT (idempotency_key) DO NOTHING` y relectura); verifican `private.is_superadmin()` y auditan en la misma transacción; con `access_request_id` validan solicitud `new` no anonimizada, la marcan `invited` (`access_requests.status`, `access_requests.invitation_id`, `access_requests.reviewed_by`, `access_requests.reviewed_at`) y auditan `access_request.converted`
- [X] T093 [P] [US1] Crear `src/features/invitations/schemas.ts` (`createInvitation`, `resendInvitation`, `revokeInvitation`, filtros de listado con `status` ∈ `pending|accepted|expired|revoked` y etiquetas en español solo en la UI) citando data-model.md `invitations.email`, `invitations.expires_in_days` e `invitations.idempotency_key` (`idempotencyKey` uuid obligatorio en `createInvitation`); `resendInvitation` con `invitationId` uuid e `idempotencyKey` uuid obligatorio citando data-model.md `invitations.resend_idempotency_key`; `revokeInvitation` con `invitationId` uuid; `accessRequestId` opcional uuid; `convertibleRequestParam` (`z.uuid()`) para el parámetro `?solicitud` que usa T164
- [X] T094 [P] [US1] Crear plantilla `src/emails/invitation.tsx` (`InvitationEmail`, contracts/emails.md)
- [X] T095 [US1] Crear `src/features/invitations/queries.ts` (`server-only`) con `listInvitations({ status?, q?, page })` (guard S2, `rpc admin_list_invitations`, 20 por página)
- [X] T096 [US1] Implementar `src/features/invitations/actions.ts`: `createInvitation` (token → `admin_create_invitation` con `idempotencyKey` → si `duplicate`, no envía correo y devuelve la misma confirmación → si no, envío → `admin_mark_invitation_sent`; `conflict` con `existing`), `resendInvitation` (también "Reintentar envío"; token → `admin_resend_invitation` con `idempotencyKey` → si `duplicate`, no envía correo y devuelve la misma confirmación → si no, envío → `admin_mark_invitation_sent`), `revokeInvitation` (si `duplicate`, misma confirmación); `revalidatePath('/admin/invitaciones')`
- [X] T097 [P] [US1] Crear `src/components/ui/pagination.tsx` (enlaces accesibles con `aria-current`, 44 px)
- [X] T098 [US1] Crear `src/app/(app)/admin/invitaciones/page.tsx` con `loading.tsx`, `error.tsx` y `src/features/invitations/components/invitations-table.tsx` (correo, estado con badge, vence, último envío, aviso de envío fallido; filtro por estado, búsqueda por correo, paginación; reenviar/revocar con diálogo de confirmación: cada apertura del diálogo de reenvío o de "Reintentar envío" genera su `idempotencyKey` con `crypto.randomUUID()` y el botón de confirmar se deshabilita mientras `pending`; estado vacío)
- [X] T099 [US1] Crear `src/app/(app)/admin/invitaciones/nueva/page.tsx` con `src/features/invitations/components/create-invitation-form.tsx` (la página genera en el servidor una `idempotencyKey` con `crypto.randomUUID()` y la pasa como campo oculto; correo, plazo 1–30 = 7; envío deshabilitado mientras `pending`; en conflicto ofrece "Reenviar"; confirmación con toast)

**Checkpoint**: ciclo de invitación completo y auditado.

---

## Phase 6: User Story 2 - La persona invitada activa su cuenta y obtiene su organización personal (Priority: P1)

**Goal**: Activación atómica e idempotente: cuenta + organización personal + pertenencia `vendedor` +
cuota + aceptaciones legales + auditoría, y entrada autenticada al onboarding.

**Independent Test**: con una invitación pendiente, abrir el enlace a 360 px, completar el formulario y
verificar sesión iniciada en `/onboarding`, org personal con pertenencia `{vendedor}`, cuota 10/100 y
`invitation.accepted`; con invitaciones vencida/revocada/usada/manipulada no hay acceso (AC-02).

### Tests for User Story 2 ⚠️

- [X] T100 [P] [US2] Prueba pgTAP `supabase/tests/database/11_accept_invitation.test.sql`: crea todo en una transacción (org `personal`, `active`, `America/Lima`, `organizations.name = full_name`, slug único: "Ñandú Pérez" → `nandu-perez`, colisión → sufijo de 4 caracteres, longitud ≤ 60; pertenencia `{vendedor}` con `invited_at`/`joined_at`; cuota 10/100; dos `legal_acceptances`; invitación aceptada; auditoría única); segunda llamada → `P0011 used`; vencida/revocada → `P0011`; fallo intermedio no deja filas; marca la solicitud de origen; con `target_organization_id` de una org suspendida → `P0011` `organization_suspended`; `p_user_id` con un correo distinto al de la invitación, o con pertenencias o fila en `platform_admins` → `P0011` `invalid`; `p_terms_doc` o `p_ai_notice_doc` que no sean los vigentes de su tipo (versión anterior, o documento de otro tipo) → `P0011` `legal_outdated` sin crear nada; las dos `legal_acceptances` referencian exactamente los documentos recibidos; solo `service_role` puede ejecutarla
- [X] T101 [P] [US2] Prueba Vitest `tests/unit/invitations/activation-schema.test.ts` (token de 43 caracteres, `invitationTokenParam` rechaza longitudes distintas de 43 y caracteres no base64url, nombre 1–80 no solo espacios, `acceptTerms`/`acceptAiNotice` literal `true`, `termsDocumentId`/`aiNoticeDocumentId` obligatorios y uuid)
- [X] T102 [P] [US2] Prueba e2e `tests/e2e/activation.spec.ts` (360 px y escritorio; cada caso usa invitaciones creadas con la factoría de T059 en el estado que necesita —pendiente, vencida, revocada, aceptada— y `uniqueClientIp()`; nunca las sembradas): correo no editable; contraseña débil muestra requisito faltante sin perder lo escrito; sin casillas no continúa; éxito → `/onboarding`; reutilizar enlace → "ya usada" + "Iniciar sesión"; vencida, revocada y manipulada → mensaje AC-02; doble clic → una sola cuenta; cuenta huérfana preexistente con el correo de la invitación (creada en la prueba con la clave secreta) → la activación se completa reutilizándola, sin cuenta duplicada; enviar el formulario con un `termsDocumentId` alterado (uuid que no es la versión vigente) → se muestra el aviso de versión actualizada con las casillas desmarcadas, el nombre se conserva y no se crea cuenta (publicar una versión real es un cambio global e irreversible, por eso el caso de versión nueva se prueba en T100); 11.º intento de activación desde la misma IP en una hora → frenado con minutos de reintento (`fixedClientIp` propia); abrir repetidamente `/invitacion/<token inexistente>` desde la misma IP → frenado (otra `fixedClientIp` propia); axe

### Implementation for User Story 2

- [X] T103 [US2] Crear `supabase/migrations/20261123001200_accept_invitation.sql` con `public.accept_invitation(...)` solo `service_role` (data-model.md → "Operaciones atómicas clave"): `FOR UPDATE`, revalidación (`P0011` con `DETAIL`; `p_user_id` debe tener el correo de la invitación y ser huérfano —sin pertenencias ni `platform_admins`—, si no `invalid`; si `invitations.target_organization_id` no es nulo, exige `organizations.status = 'active'` con `DETAIL` `organization_suspended`; en esta etapa siempre es nulo), `profiles.full_name`, `organizations.type`/`organizations.status`/`organizations.timezone`/`organizations.name` (= `full_name`)/`organizations.slug` (generado con `private.slugify(text)`, definida en esta migración según data-model.md: `unaccent`, minúsculas, no alfanuméricos → `-`, base ≤ 55, respaldo `org`; sufijo aleatorio de 4 caracteres ante colisión), `memberships.roles`/`memberships.status`/`memberships.invited_at`/`memberships.joined_at`, `quotas.daily_limit`/`quotas.monthly_limit` por defecto, `legal_acceptances.user_id`/`legal_acceptances.document_id` (= `p_terms_doc` y `p_ai_notice_doc`, que deben ser los `legal_documents` vigentes de tipo `terms` y `ai_notice`; si no, `P0011` `legal_outdated`)/`legal_acceptances.accepted_at`, `invitations.accepted_at`/`invitations.accepted_user_id`, solicitud de origen y `invitation.accepted`
- [X] T104 [P] [US2] Crear `src/features/invitations/activation-schema.ts` (`activateAccount`, contracts/server-actions.md) citando data-model.md `profiles.full_name` y `legal_acceptances.document_id` (`termsDocumentId`/`aiNoticeDocumentId` uuid), e `invitationTokenParam` (`^[A-Za-z0-9_-]{43}$`) para el parámetro de ruta `[token]`
- [X] T105 [P] [US2] Crear `src/features/legal/queries.ts` (`getCurrentLegalDocuments()`: vigente por `legal_documents.kind` = mayor `effective_at <= now()`; devuelve `id`, `version`, `effective_at` e `is_draft` de cada tipo y lee `content_path`; sus `id` son los que T108 y T161 envían como campos ocultos) y `src/features/legal/render-markdown.tsx` (subconjunto Markdown sin HTML crudo, sin dependencia nueva)
- [X] T106 [US2] Añadir `getInvitationForToken(token)` a `src/features/invitations/queries.ts` (valida el token con `invitationTokenParam` antes de cualquier consulta y devuelve estado `invalid` si no valida; consulta el rate limit `activation_ip` antes de buscar y devuelve `rate_limited` con minutos si está bloqueado; un token con formato válido pero inexistente registra un evento `activation_ip`; cliente administrativo por `sha256(token)`; devuelve solo `{ email, status, expiresAt }`)
- [X] T107 [US2] Implementar `src/features/invitations/activation-action.ts` con `activateAccount` (research.md §R4: rate limit `activation_ip` → Zod + política de contraseñas → validar invitación → comprobar que `termsDocumentId`/`aiNoticeDocumentId` siguen vigentes con `getCurrentLegalDocuments()` (si no, `validation` con `fieldErrors.legal` y `values` con el nombre, sin crear usuario; `P0011` `legal_outdated` de `accept_invitation` se mapea igual, con compensación) → `auth.admin.createUser` → `accept_invitation` → compensación eliminando el usuario si falla, solo si sigue siendo huérfano → `signInWithPassword` → `redirect('/onboarding')`; si `createUser` falla porque el correo existe y la cuenta es huérfana con el correo de la invitación, se reutiliza con `auth.admin.updateUserById(id, { password })` → `accept_invitation`, sin compensación; `conflict` solo si la cuenta no es huérfana; contracts/server-actions.md → `activateAccount`)
- [X] T108 [US2] Crear `src/app/(auth)/invitacion/[token]/page.tsx` con `src/features/invitations/components/activation-form.tsx` (correo solo lectura, nombre, contraseña con `password-requirements.tsx`, casillas de términos y aviso de IA con enlaces, campos ocultos `termsDocumentId`/`aiNoticeDocumentId` con las versiones vigentes renderizadas en el servidor, aviso y casillas desmarcadas si llega `fieldErrors.legal`, envío deshabilitado mientras `pending`) y `src/features/invitations/components/invalid-invitation.tsx` (mensaje por causa y cómo pedir otra); el `[token]` se valida con `invitationTokenParam` antes de consultar la BD y, si no valida, se muestra `invalid-invitation` con causa `invalid`
- [X] T109 [P] [US2] Crear `src/features/legal/components/legal-document.tsx` (versión, fecha, badge "Borrador" si `is_draft`) y las páginas `src/app/(public)/terminos/page.tsx` y `src/app/(public)/aviso-ia/page.tsx`
- [X] T110 [P] [US2] Crear `src/app/(app)/onboarding/page.tsx` provisional con el paso de bienvenida (se completa en US8)

**Checkpoint**: MVP P1 completo: invitar → activar → iniciar sesión → MFA de superadmin.

---

## Phase 7: User Story 5 - App shell consistente con tema claro, oscuro o del sistema (Priority: P2)

**Goal**: Barra superior con marca, navegación por rol (barra inferior en móvil), menú de cuenta con perfil,
tema y cierre de sesión, todo accesible por teclado.

**Independent Test**: con vendedor y superadmin, recorrer la navegación a 360 px y escritorio solo con
teclado, cambiar el tema y recargar sin parpadeo, cerrar sesión; axe sin violaciones serias.

### Tests for User Story 5 ⚠️

- [X] T111 [P] [US5] Prueba e2e `tests/e2e/app-shell.spec.ts`: navegación de escritorio y barra inferior a 360 px (objetivos ≥ 44 px, sin scroll horizontal); superadmin ve Invitaciones, Solicitudes, Organizaciones, Consumo y Design system; vendedor no; enlace "Saltar al contenido" primero; menú de cuenta con teclado y Escape devuelve el foco; axe en ambos temas
- [X] T112 [P] [US5] Prueba e2e `tests/e2e/theme.spec.ts`: claro/oscuro/sistema se aplican al instante; al recargar la clase de `<html>` es correcta antes de hidratar; con "sistema", `page.emulateMedia({ colorScheme })` cambia el tema en vivo

### Implementation for User Story 5

- [X] T113 [P] [US5] Crear `src/components/ui/avatar.tsx` (iniciales con `initials.ts`, par `avatar-n`/`on-avatar-n` determinista por hash de `user_id`)
- [X] T114 [P] [US5] Crear `src/components/brand/logo.tsx` (marca con tokens y nombre accesible) y `src/components/app-shell/skip-link.tsx`
- [X] T115 [P] [US5] Crear `src/components/app-shell/nav-config.ts` (secciones por rol de contracts/routes.md → "Navegación por rol", con `badgeCount` opcional)
- [X] T116 [P] [US5] Crear `src/components/app-shell/top-bar.tsx` y `src/components/app-shell/desktop-nav.tsx` (`aria-current="page"`)
- [X] T117 [P] [US5] Crear `src/components/app-shell/bottom-nav.tsx` (< 768 px, objetivos ≥ 44 px, `safe-area-inset`)
- [X] T118 [US5] Crear `src/components/app-shell/account-menu.tsx` (dropdown: Perfil, Tema claro/oscuro/sistema con radio items de next-themes, Retomar onboarding solo vendedor, Cerrar sesión)
- [X] T119 [US5] Crear `src/components/app-shell/app-shell.tsx` y reemplazar la cabecera mínima de `src/app/(app)/layout.tsx` por la app shell completa (recibe el contexto de `getRequestContext()`)

**Checkpoint**: todas las pantallas autenticadas viven en la app shell.

---

## Phase 8: User Story 6 - Design system documentado en /design (Priority: P2)

**Goal**: Completar los componentes base y documentar tokens y componentes en `/design` (solo superadmin).

**Independent Test**: superadmin abre `/design` y ve cada token y componente en claro y oscuro con estados;
vendedor ve "sin permiso".

### Tests for User Story 6 ⚠️

- [X] T120 [P] [US6] Prueba e2e `tests/e2e/design-system.spec.ts`: superadmin ve secciones de tokens (con ratios de contraste) y los 22 componentes de FR-043 en ambos paneles; gauge y anillo exponen `role="meter"` y `aria-valuenow`; con `reducedMotion: 'reduce'` no hay animación; vendedor → "sin permiso"; axe en ambos temas

### Implementation for User Story 6

- [X] T121 [P] [US6] Crear `src/components/ui/radio-group.tsx`, `src/components/ui/switch.tsx` y `src/components/ui/tabs.tsx`
- [X] T122 [P] [US6] Crear `src/components/ui/sheet.tsx` (Radix) y `src/components/ui/bottom-sheet.tsx` (vaul)
- [X] T123 [P] [US6] Crear `src/components/ui/tooltip.tsx` y `src/components/ui/progress.tsx`
- [X] T124 [P] [US6] Crear `src/components/ui/gauge.tsx` y `src/components/ui/score-ring.tsx` (SVG propio, `role="meter"`, `aria-valuemin/max/now`, animación con Motion respetando `MotionConfig reducedMotion="user"`)
- [X] T125 [US6] Crear `src/features/design-system/components/tokens-section.tsx` (colores semánticos con ratio de `contrast.ts` sobre `token-pairs.ts`, tipografía, espaciado, radios, elevación, motion)
- [X] T126 [US6] Crear `src/features/design-system/components/components-section.tsx` (todos los componentes de FR-043 más label, form-field y pagination en dos paneles con clase `.light`/`.dark` forzada y estados normal, foco, deshabilitado, error y carga)
- [X] T127 [US6] Crear `src/app/(app)/design/page.tsx` y `src/app/(app)/design/layout.tsx` (`requireSuperadmin()` → `Forbidden`) componiendo T125 y T126

**Checkpoint**: SC-012 verificable.

---

## Phase 9: User Story 7 - Cuotas, suspensión de organizaciones y consumo de IA (Priority: P2)

**Goal**: Listado de organizaciones con cuota y consumo del mes actual (en la zona horaria de cada organización), edición de cuotas, suspensión/reactivación
con efecto inmediato y panel de consumo agregado sin acceso a contenido.

**Independent Test**: superadmin edita la cuota de una org de prueba (5/3 falla, 3/50 guarda y audita), la
suspende (su vendedor con sesión abierta va a `/acceso-suspendido` en su siguiente petición), la reactiva y
consulta el consumo por periodo. En e2e la org y su vendedor se crean con la factoría de T059 (nunca la org A
sembrada).

### Tests for User Story 7 ⚠️

- [X] T128 [P] [US7] Prueba pgTAP `supabase/tests/database/13_organizations_admin.test.sql`: `aal1` → `42501`; `admin_update_quota` valida y audita antes/después, no-op sin cambios; `admin_set_organization_status` exige motivo 1–500 no solo espacios al suspender (`'   '` → `23514`), `P0010` si ya está en el estado, audita, y al reactivar conserva `organizations.suspended_reason`/`suspended_at`/`suspended_by`; tras suspender, el vendedor de esa org no lee nada; `admin_usage_summary` respeta la zona horaria de cada org y solo depende de `organizations` y `ai_usage` (consulta a `pg_depend`/definición)
- [X] T129 [P] [US7] Pruebas Vitest `tests/unit/organizations/schemas.test.ts` (enteros ≥ 0, diaria ≤ mensual con error en el campo diario, motivo 1–500 tras `trim()` —solo espacios rechazado—, `organizationId` no uuid rechazado en `updateQuota`, `suspendOrganization` y `reactivateOrganization`) y `tests/unit/usage/periods.test.ts` + `tests/unit/usage/schemas.test.ts` (hoy, mes actual, mes anterior, rango; el esquema rechaza periodo desconocido, fechas mal formadas y `from > to`)
- [X] T130 [P] [US7] Prueba e2e `tests/e2e/organizations.spec.ts` (org y vendedor creados con la factoría de T059, nunca la org A sembrada; `uniqueClientIp()`; la fila se localiza con la búsqueda `q` por el nombre único de la org): columnas del listado; cuota inválida y válida; motivo solo con espacios rechazado; suspender con motivo → el vendedor de la org de prueba con sesión abierta llega a `/acceso-suspendido`; reactivar devuelve el acceso; auditoría; axe
- [X] T131 [P] [US7] Prueba e2e `tests/e2e/usage.spec.ts`: periodos con datos sembrados y totales en US$; rango sin datos → estado vacío; ninguna vista enlaza a contenido de conversaciones (FR-006)

### Implementation for User Story 7

- [X] T132 [US7] Crear `supabase/migrations/20261123001300_organization_admin_functions.sql` con `admin_list_organizations`, `admin_update_quota`, `admin_set_organization_status`, `admin_usage_summary` (contracts/database-rpc.md) que mantienen `quotas.daily_limit`, `quotas.monthly_limit`, `quotas.updated_at`, `quotas.updated_by`, `organizations.status`, `organizations.suspended_reason`, `organizations.suspended_at`, `organizations.suspended_by` según data-model.md (al reactivar se conservan como última suspensión; la UI solo los muestra si `status = suspended`) y agregan `ai_usage.simulation_id` (simulaciones = `count(distinct)`), `ai_usage.input_tokens`, `ai_usage.output_tokens`, `ai_usage.estimated_cost_usd` por día local de `organizations.timezone`
- [X] T133 [P] [US7] Crear `src/features/organizations/schemas.ts` (`updateQuota` citando data-model.md `quotas.daily_limit` y `quotas.monthly_limit`; `suspendOrganization` citando data-model.md `organizations.suspended_reason` (`trim()`, 1–500, no solo espacios); `reactivateOrganization`; `organizationId` uuid en las tres)
- [X] T134 [P] [US7] Crear `src/features/usage/periods.ts` y `src/features/usage/schemas.ts` (periodo → `from`/`to` como fechas)
- [X] T135 [P] [US7] Crear `src/features/organizations/queries.ts` con `listOrganizations({ q?, page })` (S2, `rpc admin_list_organizations`)
- [X] T136 [P] [US7] Crear `src/features/usage/queries.ts` con `getUsageSummary({ from, to })` (S2, `rpc admin_usage_summary`)
- [X] T137 [US7] Implementar `src/features/organizations/actions.ts`: `updateQuota`, `suspendOrganization`, `reactivateOrganization` (guard S2, Zod, RPC, `revalidatePath`)
- [X] T138 [US7] Crear `src/app/(app)/admin/organizaciones/page.tsx` con `loading.tsx`, `error.tsx` y en `src/features/organizations/components/`: `organizations-table.tsx`, `quota-dialog.tsx`, `suspend-dialog.tsx` (motivo obligatorio ≤ 500 con contador) y `reactivate-dialog.tsx`
- [X] T139 [US7] Crear `src/app/(app)/admin/consumo/page.tsx` con `loading.tsx`, `error.tsx`, `src/features/usage/components/period-selector.tsx` y `src/features/usage/components/usage-table.tsx` (simulaciones, tokens de entrada/salida, costo `US$`, totales, estado vacío explicativo)

**Checkpoint**: control de costos listo para la feature 002.

---

## Phase 10: User Story 8 - Onboarding breve del vendedor (Priority: P3)

**Goal**: Onboarding de 3 pasos con progreso, saltar y retomar.

**Independent Test**: vendedor nuevo avanza al paso 2, sale y vuelve (retoma en 2); otro lo salta, llega a
`/inicio` y lo reabre desde el inicio o el menú de cuenta.

### Tests for User Story 8 ⚠️

- [X] T140 [P] [US8] Prueba e2e `tests/e2e/onboarding.spec.ts` (vendedores con `onboarding_status = pending` creados con la factoría de T059, uno por caso; el vendedor C sembrado solo para lectura): "Paso 1 de 3"; retomar en paso 2; "Saltar" → `/inicio` sin reapertura automática; retomar desde inicio y menú; completar → `/perfil`; teclado y axe
- [X] T183 [P] [US8] Prueba Vitest `tests/unit/onboarding/schemas.test.ts` (Principio II): `step` acepta solo 1, 2 y 3 y rechaza 0, 4, decimales y texto

### Implementation for User Story 8

- [X] T141 [P] [US8] Crear `src/features/onboarding/steps.ts` (contenido de los 3 pasos en español) y `src/features/onboarding/schemas.ts` (`step` 1|2|3 citando data-model.md `profiles.onboarding_step`)
- [X] T142 [US8] Implementar `src/features/onboarding/actions.ts`: `setOnboardingStep`, `skipOnboarding`, `completeOnboarding`, `resumeOnboarding` (guard `requireOrgMember(personalOrg, ['vendedor'])`; persisten `profiles.onboarding_status` y `profiles.onboarding_step` según data-model.md)
- [X] T143 [US8] Reemplazar `src/app/(app)/onboarding/page.tsx` por el stepper en `src/features/onboarding/components/onboarding-stepper.tsx` ("Paso n de 3" con barra de progreso, Anterior/Siguiente/Saltar, retoma en `onboarding_step`)
- [X] T144 [US8] Añadir la tarjeta "Retomar onboarding" a `src/app/(app)/inicio/page.tsx` (si `skipped`/`in_progress`) y conectar el ítem "Retomar onboarding" de `src/components/app-shell/account-menu.tsx` a `resumeOnboarding`

**Checkpoint**: US8 independiente y probada.

---

## Phase 11: User Story 9 - El vendedor edita su perfil (Priority: P3)

**Goal**: Editar nombre y zona horaria; avatar con iniciales y fechas en la zona del usuario.

**Independent Test**: el vendedor cambia su nombre a "Ñandú" y su zona a `America/Bogota`; el avatar muestra
"Ñ" y las fechas se muestran en la nueva zona.

### Tests for User Story 9 ⚠️

- [X] T145 [P] [US9] Prueba pgTAP `supabase/tests/database/15_profile_grants.test.sql`: el usuario solo actualiza `onboarding_status` y `onboarding_step` directamente; `full_name`/`timezone` solo vía `update_my_profile`; no puede cambiar `email` ni el perfil de otro; `update_my_profile` sincroniza `organizations.name` y `organizations.timezone` en org personal (el slug no cambia); un miembro de una org suspendida no puede actualizar `onboarding_*` directamente (0 filas afectadas); rechaza zona inválida (`22023`); rechaza a un miembro de org suspendida (`42501`)
- [X] T146 [P] [US9] Prueba Vitest `tests/unit/profile/schemas.test.ts` (nombre 1–80 no solo espacios; zona: formato `^[A-Za-z0-9_+\-/]+$` de 1–64 caracteres, sin exigir pertenencia a la lista de `Intl`)
- [X] T147 [P] [US9] Prueba e2e `tests/e2e/profile.spec.ts` (los casos que guardan cambios usan un vendedor creado con la factoría de T059; el vendedor D sembrado solo para el rechazo): guardar nombre y zona; las fechas de aceptación mostradas cambian a la nueva zona (FR-036); iniciales en barra superior y menú; error junto al campo con nombre vacío o > 80; correo y fechas de aceptación en solo lectura; combobox operable con teclado; vendedor D de la org suspendida sembrada con sesión abierta → `updateProfile` rechazado; axe

### Implementation for User Story 9

- [X] T176 [US9] Crear `supabase/migrations/20261123001400_profile_functions.sql` con `public.update_my_profile(p_full_name text, p_timezone text)` (`authenticated`, `security definer`, `search_path = ''`): exige `private.current_session_ok()` y pertenencia operativa (org `active` + pertenencia `active`) o `private.is_superadmin()`; valida `profiles.full_name` y `profiles.timezone` según data-model.md (`private.is_valid_timezone`); actualiza `profiles` y, si el usuario es el único miembro de una org `personal`, también `organizations.name` (= `full_name`) y `organizations.timezone` (el slug no cambia); `42501` sin permiso, `22023` zona inválida
- [X] T148 [P] [US9] Crear `src/features/profile/schemas.ts` (`updateProfile` citando data-model.md `profiles.full_name` y `profiles.timezone`; `timezone` solo valida formato: string 1–64 con `^[A-Za-z0-9_+\-/]+$`; la BD es la autoridad con `pg_timezone_names`)
- [X] T149 [P] [US9] Crear `src/components/ui/combobox.tsx` (cmdk + popover de Radix, con buscador y teclado) y añadirlo a `src/features/design-system/components/components-section.tsx`
- [X] T150 [US9] Crear `src/features/profile/queries.ts` (`getProfile()`: perfil + `legal_acceptances` con su documento, vía RLS)
- [X] T151 [US9] Implementar `src/features/profile/actions.ts` con `updateProfile` (`requireOperativeUser()`, `rpc update_my_profile` con el cliente de usuario, mapeo `22023` → error de validación en el campo de zona, `revalidatePath('/', 'layout')` para refrescar el avatar y las fechas)
- [X] T152 [US9] Crear `src/app/(app)/perfil/page.tsx` con `loading.tsx`, `error.tsx`, `src/features/profile/components/profile-form.tsx` y `src/features/profile/components/timezone-combobox.tsx` (opciones de `Intl.supportedValuesOf('timeZone')` que siempre incluyen el valor actual aunque no figure en esa lista; por defecto `America/Lima`; fechas con `format.ts` en la zona del usuario)

**Checkpoint**: US9 independiente y probada.

---

## Phase 12: User Story 10 - Landing pública y "Solicitar acceso" (Priority: P3)

**Goal**: Landing con propuesta de valor, formulario anti-abuso de solicitud, bandeja de solicitudes con
contador, conversión en invitación, descarte y retención automática.

**Independent Test**: un visitante envía una solicitud a 360 px; el superadmin la ve en la bandeja (contador),
la convierte en invitación con el correo precargado y queda "invitada".

### Tests for User Story 10 ⚠️

- [X] T153 [P] [US10] Prueba pgTAP `supabase/tests/database/14_access_requests.test.sql`: `anon`/`authenticated` sin INSERT; `aal1` y no superadmin → `42501` en `admin_discard_access_request`; `admin_discard_access_request` solo desde `new`, audita `automatic: false`; `run_access_request_retention()` descarta `new` > 180 días con auditoría `system` y anonimiza descartadas > 90 días; `invited` intacta; anonimizada no convertible (`admin_create_invitation` falla)
- [X] T154 [P] [US10] Prueba Vitest `tests/unit/access-requests/schemas.test.ts` (campos y longitudes, honeypot vacío, `startedAt` firmado y ≥ 3 s, `privacyDocumentId` ausente o no uuid rechazado, `discardAccessRequest` con `accessRequestId` no uuid rechazado)
- [X] T155 [P] [US10] Prueba e2e `tests/e2e/landing-access-request.spec.ts` (correos únicos por prueba e `uniqueClientIp()`; las solicitudes que se convierten, descartan o se muestran anonimizadas se crean con la factoría de T059, nunca las sembradas): landing con propuesta, cómo funciona, aviso IA, "Solicitar acceso", "Iniciar sesión" y enlaces legales; envío válido a 360 px; errores junto a campos sin perder lo escrito; `privacyDocumentId` alterado (uuid que no es la versión vigente) → aviso de política actualizada sin perder lo escrito y sin fila nueva; 4.º envío en una hora frenado (`fixedClientIp` propia de ese caso); duplicado sin nueva fila y misma confirmación; axe. Casos `@global` (proyecto `global` de T007, en serie): el contador de la bandeja y de la navegación (T165) sube exactamente en 1 al crear una solicitud `nueva` con la factoría y baja en 1 al descartarla; convertir precarga el correo y marca "invitada"; descartar; anonimizada sin datos ni acción

### Implementation for User Story 10

- [X] T156 [US10] Crear `supabase/migrations/20261123001500_access_request_functions.sql` con `admin_discard_access_request` y `private.run_access_request_retention()` + job `pg_cron` diario 08:15 UTC (research.md §R12), que mantienen `access_requests.status`, `access_requests.discarded_at`, `access_requests.discarded_by_system`, `access_requests.reviewed_by`, `access_requests.reviewed_at`, `access_requests.anonymized_at` y anonimizan `access_requests.full_name`, `access_requests.email`, `access_requests.company_or_role`, `access_requests.message` según data-model.md
- [X] T157 [P] [US10] Crear `src/features/access-requests/schemas.ts` (`submitAccessRequest` citando data-model.md `access_requests.full_name`, `access_requests.email`, `access_requests.company_or_role`, `access_requests.message`; `acceptPrivacy` literal `true`; `privacyDocumentId` uuid citando `access_requests.privacy_document_id`; honeypot `website` literal `''`; `startedAt` firmado) y `discardAccessRequest` (`accessRequestId` uuid)
- [X] T158 [US10] Implementar `src/features/access-requests/actions.ts`: `submitAccessRequest` (honeypot, tiempo mínimo ≥ 3 s con HMAC, rate limit `access_request_ip`, comprueba que `privacyDocumentId` sea la política vigente (`getCurrentLegalDocuments()`; si no, `validation` con `fieldErrors.acceptPrivacy` conservando lo escrito), INSERT con cliente administrativo con `access_requests.privacy_document_id` = `privacyDocumentId` y `access_requests.privacy_accepted_at`, duplicado → misma confirmación) y `discardAccessRequest` (S2)
- [X] T159 [P] [US10] Crear `src/features/access-requests/queries.ts` con `listAccessRequests({ status?, page })`, `countNewAccessRequests()` y `getConvertibleAccessRequest(id)` (S2, RLS)
- [X] T160 [P] [US10] Crear `src/app/(public)/layout.tsx` (cabecera con marca e "Iniciar sesión", pie con enlaces a términos, privacidad y aviso IA) y la landing `src/app/(public)/page.tsx`, que reemplaza la provisional de T073 ("Practica la venta antes de hacerla de verdad", cómo funciona, aviso IA, CTA "Solicitar acceso"; sin imágenes que penalicen LCP)
- [X] T161 [US10] Crear `src/app/(public)/solicitar-acceso/page.tsx` con `src/features/access-requests/components/access-request-form.tsx` (honeypot oculto también para lectores de pantalla, `startedAt` firmado en el servidor, campo oculto `privacyDocumentId` con la versión vigente renderizada en el servidor y aviso con la casilla desmarcada si llega `fieldErrors.acceptPrivacy`, contador de 500 caracteres, confirmación clara) y añadir el enlace "Solicitar acceso" a `src/features/auth/components/sign-in-form.tsx`
- [X] T162 [P] [US10] Crear `src/app/(public)/privacidad/page.tsx` con `legal-document.tsx`
- [X] T163 [US10] Crear `src/app/(app)/admin/solicitudes/page.tsx` con `loading.tsx`, `error.tsx` y `src/features/access-requests/components/access-requests-table.tsx` (contador de nuevas, filtro por estado, "Convertir en invitación" → `/admin/invitaciones/nueva?solicitud={id}`, descartar con confirmación, filas anonimizadas sin datos personales ni conversión, estado vacío)
- [X] T164 [US10] Precargar y vincular la solicitud en `src/app/(app)/admin/invitaciones/nueva/page.tsx` y `create-invitation-form.tsx` (lee `?solicitud` y lo valida con `convertibleRequestParam` de `src/features/invitations/schemas.ts` (T093, `z.uuid()`) antes de llamar a `getConvertibleAccessRequest`; si no es un uuid válido o la solicitud no es convertible, muestra el formulario sin precarga con un aviso informativo; si es válida, precarga el correo y envía `accessRequestId`)
- [X] T165 [US10] Mostrar el contador de solicitudes nuevas en la navegación de superadmin: `badgeCount` en `src/components/app-shell/nav-config.ts` alimentado por `countNewAccessRequests()` desde `src/app/(app)/layout.tsx`

**Checkpoint**: las 10 historias funcionan de forma independiente.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Verificaciones transversales, rendimiento, CI completo y validación final.

- [X] T166 [P] Suite e2e de aislamiento `tests/e2e/isolation.spec.ts` (AC-01, FR-005, SC-004): con sesión del vendedor A, REST `/rest/v1/{quotas,organizations,memberships,ai_usage,teams}?organization_id=eq.<B>` → cero filas; escrituras directas rechazadas; rutas y acciones con ids de B → "no encontrado"/"sin permiso"; rutas `/admin/*` y `/design` → "sin permiso"
- [X] T167 [P] Barrido de accesibilidad `tests/e2e/a11y-sweep.spec.ts` (SC-006, FR-052): todas las rutas de contracts/routes.md en `mobile-360` y `desktop` × claro y oscuro con axe sin `serious`/`critical`, sin scroll horizontal y objetivos ≥ 44 px; recorrido solo con teclado de los formularios principales
- [X] T168 [P] Prueba e2e `tests/e2e/errors.spec.ts`: 404 con marca y camino de regreso; error inesperado con "Reintentar" e id de referencia, sin trazas ni ids internos (FR-039, FR-040)
- [X] T169 [P] Configurar Lighthouse CI en `lighthouserc.json` (landing, `/iniciar-sesion` y `/inicio` con sesión sembrada; perfil móvil; Performance ≥ 0,9, Accessibility = 1, LCP < 2,5 s, CLS < 0,1) y añadir el job `lighthouse` a `.github/workflows/ci.yml` (SC-007, SC-008)
- [ ] T170 Añadir el job `e2e` a `.github/workflows/ci.yml` (`supabase start` + `db reset` + build + Playwright con reporte de artefactos); configurar la protección de rama de `main` con `gh api repos/{owner}/{repo}/branches/main/protection` (PR obligatorio, rama actualizada antes del merge, checks obligatorios `lint`, `typecheck`, `unit`, `db`, `build`, `bundle-secrets`, `e2e` y `lighthouse`) y documentar en `README.md` la configuración y cómo verificarla (Principio V)
  - Estado 2026-11-24: jobs `e2e` y `lighthouse` y documentación hechos. Pendiente: activar la protección de `main` cuando el CI pase en verde (comando en README.md).
- [X] T171 [P] Crear `.github/pull_request_template.md` con checklist de accesibilidad, estados por pantalla (vacío, carga, error, sin permiso, éxito), evidencia de pruebas y capturas móvil/escritorio
- [X] T172 [P] Redactar `README.md` (requisitos, puesta en marcha de quickstart.md, variables, scripts, enlace a `scripts/ops/README.md` y política de retención de research.md §R11, y la sección "Pendientes operativos": la purga de `audit_logs` debe implementarse antes de que el primer registro de producción cumpla 22 meses (margen de 2 respecto de la retención de 24), con fecha límite calculada desde el primer despliegue y un issue de seguimiento en GitHub)
- [X] T173 Revisión de seguridad (OWASP ASVS): confirmar `import "server-only"` en `src/lib/supabase/admin.ts`, `src/lib/env.ts`, `src/lib/email/*`, `src/lib/security/password-policy.ts` y todas las `queries.ts`; ningún `console.*` con PII; CSP sin violaciones en el preview; `pnpm check:bundle-secrets` en verde
- [X] T174 Revisar que toda pantalla de contracts/routes.md tenga `loading.tsx`, `error.tsx`, estado vacío y "sin permiso" donde aplique, y corregir faltantes
- [ ] T177 [P] Medir SC-001 y el presupuesto p95: script `scripts/ci/measure-email-latency.ts` que envía 20 invitaciones en producción, antes de abrir el acceso, a un buzón de prueba y calcula el p95 de entrega con los eventos `email.delivered` de Resend (< 2 min); revisar en Vercel Speed Insights de producción el p95 de carga de landing, `/iniciar-sesion` e `/inicio` (< 3 s). Registrar ambos resultados en el PR (Principio V)
- [X] T179 [P] Prueba guardiana `supabase/tests/database/16_admin_guard_sweep.test.sql` (SC-005): recorre `pg_proc` de `public` con prefijo `admin_` y verifica que cada función lanza `42501` con JWT de superadmin `aal1` y con JWT de vendedor (falla si aparece una `admin_*` nueva sin guard); con `aal1`, SELECT sobre `invitations`, `access_requests` y `audit_logs` devuelve cero filas
- [ ] T184 [P] Sesión de pruebas con usuarios en producción, antes de abrir el acceso (cuentas de prueba suspendidas al terminar), según `specs/001-platform-foundation/quickstart.md` → "Pruebas con usuarios (SC-001, SC-002, SC-011)": ≥ 10 personas invitadas de prueba (SC-002: tiempo desde abrir el enlace hasta `/onboarding` < 3 min y ≥ 90 % al primer intento sin ayuda); 5 repeticiones del superadmin creando una invitación (SC-001, < 1 min) y localizando el consumo y la cuota de una organización dada (SC-011, < 30 s); cronometraje y resultados (tiempos, mediana, % de éxito, observaciones) registrados en el PR (Principio V)
- [ ] T175 Ejecutar los escenarios 1–20 y el reset de MFA de `specs/001-platform-foundation/quickstart.md` en local y en producción antes de abrir el acceso (incluida la revisión de correos en Gmail/Outlook/Apple Mail en claro y oscuro), adjuntar los resultados de T177 y T184 y registrar el resultado en el PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; BLOQUEA todas las historias.
- **P1 (Phases 3–6)**: US3 → US4 → US1 → US2 (cadena funcional: sesión → `aal2` → invitaciones → activación).
- **P2 (Phases 7–9)**: dependen de Foundational; US7 usa la sesión `aal2` de US4 para sus pruebas e2e. US5
  y US7 pueden avanzar en paralelo entre sí; US6 puede empezar sus componentes (T121–T124) en paralelo,
  pero T126 (`components-section.tsx`) necesita `avatar.tsx` de T113 (US5).
- **P3 (Phases 10–12)**: US8 depende de US2 (placeholder de `/onboarding`), US5 (`account-menu.tsx`) y US6
  (`progress.tsx` de T123); US9 depende de US5 (avatar) y US6 (T149 edita `components-section.tsx` de
  T126); US10 depende de US1 (conversión en invitación), US2 (`getCurrentLegalDocuments()` y
  `legal-document.tsx`) y US5 (contador en la nav). En e2e, los vendedores de US8 y US9 se crean con
  factorías (Regla de datos e2e).
- **Polish (Phase 13)**: tras las historias deseadas.

### User Story Dependencies

| Historia | Depende de | Motivo |
|---|---|---|
| US3 (P1) | Foundational | — |
| US4 (P1) | US3 | flujo de `signIn` y destino |
| US1 (P1) | US4 | rutas admin exigen `aal2` |
| US2 (P1) | US1 | necesita invitaciones (`admin_*` y correo) |
| US5 (P2) | US3 | sustituye la cabecera mínima del layout |
| US6 (P2) | US4, US5 | `/design` exige `aal2`; `avatar.tsx` (T113) se documenta en `/design` (T126) |
| US7 (P2) | US4 | rutas admin |
| US8 (P3) | US2, US5, US6 | placeholder de `/onboarding`, menú de cuenta; el stepper usa `progress.tsx` (T123) |
| US9 (P3) | US5, US6 | avatar en la app shell; T149 edita `components-section.tsx` (T126) |
| US10 (P3) | US1, US2, US5 | `admin_create_invitation` con solicitud; documentos legales vigentes (T105, T109); contador en la nav |

### Within Each User Story

- Pruebas primero (deben fallar) → migración SQL → esquemas Zod → queries → actions → páginas/componentes.
- Archivos compartidos entre tareas se editan en secuencia: `src/app/(app)/layout.tsx`: T055 → T078
  → T119 → T165; `src/features/invitations/queries.ts`: T095 → T106; `ci.yml`: T011 → T028 → T060 → T169 → T170;
  `src/features/design-system/components/components-section.tsx`: T126 → T149;
  `src/app/(app)/admin/invitaciones/nueva/page.tsx` y `create-invitation-form.tsx`: T099 → T164;
  `src/components/app-shell/account-menu.tsx`: T118 → T144; `src/app/(app)/inicio/page.tsx`: T077 → T144;
  `src/app/(app)/onboarding/page.tsx`: T110 → T143; `src/components/app-shell/nav-config.ts`: T115 → T165;
  `src/app/(public)/page.tsx`: T073 → T160; `src/features/auth/components/sign-in-form.tsx`: T073 → T161.
  En US9, T176 (migración `update_my_profile`) precede a T151.

### Parallel Opportunities

- Setup: T004–T009, T011.
- Foundational: T020 en paralelo con migraciones; T022–T027 tras T019; T029–T032, T034, T038, T039, T041,
  T042 en paralelo; T046–T053 en paralelo tras T043; T056–T059 en paralelo.
- Cada historia: todas sus tareas de prueba [P] juntas; esquemas, plantillas y componentes [P] juntos.
- Tras US4: US5 y US7 en paralelo por distintas personas; US6 en paralelo con sus componentes (T121–T124)
  y T125–T127 en cuanto exista T113 (avatar, US5).
- Tras US5 y US6: US8 y US9 en paralelo; US10 en paralelo con ambas (sus migraciones toman el siguiente
  timestamp libre, ver Notes).

---

## Parallel Example: User Story 1

```bash
# Pruebas de US1 en paralelo:
Task: "Prueba pgTAP supabase/tests/database/10_invitations_admin.test.sql"
Task: "Pruebas Vitest tests/unit/invitations/schemas.test.ts y tests/unit/emails/invitation.test.ts"
Task: "Prueba e2e tests/e2e/invitations.spec.ts"

# Piezas independientes de US1 en paralelo (tras T092):
Task: "Esquemas src/features/invitations/schemas.ts"
Task: "Plantilla src/emails/invitation.tsx"
Task: "Componente src/components/ui/pagination.tsx"
```

## Parallel Example: User Story 7

```bash
Task: "Prueba pgTAP supabase/tests/database/13_organizations_admin.test.sql"
Task: "Pruebas Vitest tests/unit/organizations/schemas.test.ts y tests/unit/usage/periods.test.ts"
Task: "Prueba e2e tests/e2e/organizations.spec.ts"
Task: "Prueba e2e tests/e2e/usage.spec.ts"

# Tras T132:
Task: "src/features/organizations/schemas.ts"
Task: "src/features/usage/periods.ts + schemas.ts"
Task: "src/features/organizations/queries.ts"
Task: "src/features/usage/queries.ts"
```

---

## Trazabilidad historia → AC/FR → prueba (Principio V)

| Historia | Requisitos / AC | Pruebas |
|---|---|---|
| Base | FR-001–FR-004, FR-029, FR-042, SC-009, AC-01, Principio IV (lint de tokens) | T022–T027, T044, T056–T058, T005 (`tests/unit/lint/no-literal-styles.test.ts`) |
| US3 | FR-018–FR-023 | T061–T066 |
| US4 | FR-023 (TOTP), FR-025–FR-027a, SC-005, Principio II (Zod) | T079, T080, T179, T181, T182 |
| US1 | FR-007–FR-013, FR-028, SC-001, SC-010, Principio II (idempotencia de reenvío y revocación) | T089–T091, T177, T184 (SC-001) |
| US2 | FR-011, FR-014–FR-017 (incl. cuenta huérfana y versión legal mostrada), AC-02, SC-003 | T100–T102 |
| US5 | FR-037, FR-038, FR-046 | T111, T112 |
| US6 | FR-041–FR-045, SC-012 | T120, T044 |
| US7 | FR-006, FR-024, FR-024a, FR-030–FR-033, SC-011 | T128–T131, T064, T025 (pertenencia suspendida), T184 (SC-011) |
| US8 | FR-034 | T140, T183, T023 (`onboarding_updated_at`) |
| US9 | FR-035, FR-036 | T145–T147, T091 (fechas del superadmin) |
| Auditoría | FR-028, SC-010 | T089 (invitaciones), T100 (aceptación), T080 (`superadmin.login`), T128 (cuotas y organizaciones), T153 (solicitudes), T181 (`superadmin.mfa_reset`) |
| US10 | FR-047–FR-049a | T153–T155 |
| Correos y lenguaje | FR-050, FR-051 | T062, T090 (asunto, texto plano, español); T175 (clientes de correo en claro/oscuro, revisión de microcopy) |
| Pruebas con usuarios | SC-001, SC-002, SC-011 | T184 (fuera de CI, en producción antes de abrir el acceso; resultados en el PR y adjuntos en T175) |
| Transversal | FR-005, AC-01, SC-004, SC-006–SC-008, FR-039, FR-040, FR-052, AC-12 | T166–T169 |

---

## Implementation Strategy

### MVP First (P1: US3 + US4 + US1 + US2)

1. Phase 1 Setup → Phase 2 Foundational (crítica).
2. US3 (sesión) → US4 (MFA) → US1 (invitaciones) → US2 (activación).
3. **STOP and VALIDATE**: escenarios 1–10 y 19 de quickstart.md; suites db/unit/e2e en verde.
4. Desplegar preview: ya se puede invitar y activar vendedores reales de prueba.

> US1 sola no es demostrable sin sesión `aal2` (US3 + US4), por eso el MVP mínimo útil es el bloque P1
> completo.

### Incremental Delivery

1. MVP P1 → preview/demo.
2. US5 (app shell) + US6 (`/design`) + US7 (cuotas/suspensión/consumo) → preview.
3. US8 (onboarding) + US9 (perfil) + US10 (landing y solicitudes) → preview.
4. Polish → criterios de salida de quickstart.md.

### Parallel Team Strategy

1. Todo el equipo: Setup + Foundational.
2. Una persona: cadena P1 (US3 → US4 → US1 → US2); otra: app shell (US5) tras US3, componentes de US6
   (T121–T124) en paralelo, y `/design` (T125–T127) en cuanto existan US4 y el avatar de US5 (T113).
3. Tras P1: US7 en paralelo con lo anterior; US10 en cuanto exista US5 (contador en la nav, T165); US8/US9
   en paralelo en cuanto US5 y US6 estén completas.

---

## Notes

- [P] = archivos distintos y sin dependencias pendientes.
- Los IDs T176–T184 se añadieron tras la numeración inicial; el orden lo determina su fase, no su número.
- Cada migración incluye en su encabezado la migración inversa (rollback) documentada.
- Los timestamps de migración de las tareas son indicativos y siguen el orden de las fases; una migración
  nueva nunca usa un timestamp anterior a otra ya creada. Si las historias se implementan en otro orden
  (p. ej., US10 antes que US9), la migración se crea con un timestamp mayor que la última existente y se
  actualiza la ruta en la tarea.
- Regla de datos e2e (ver Path Conventions): datos sembrados de solo lectura; toda prueba que mute estado
  usa las factorías de T059; IP única por prueba salvo en las pruebas de límites por IP; filas localizadas
  por su correo u organización únicos; agregados globales y bandeja de solicitudes solo en pruebas `@global`.
- Ninguna tarea registra contraseñas, códigos TOTP, tokens ni enlaces de un solo uso en logs, Sentry o auditoría.
- Commit tras cada tarea o grupo lógico (Conventional Commits, en inglés).
- Detenerse en cada checkpoint para validar la historia de forma independiente.
