# Implementation Plan: Fundación de la plataforma Creando Valor IA™

**Branch**: `001-platform-foundation` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-platform-foundation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Primera entrega del SaaS: una única aplicación Next.js (App Router) sobre Supabase que deja lista la
base multiempresa (organizaciones, pertenencias, roles, cuotas, uso de IA, auditoría y solicitudes de
acceso con RLS en todas las tablas), el acceso solo por invitación (invitaciones propias con token
aleatorio hasheado; la cuenta, la organización personal, la pertenencia `vendedor`, la cuota y la
auditoría se crean en una operación atómica e idempotente), sesión con política de duración aplicada
por la app y por la BD, MFA TOTP obligatorio para el superadministrador (todo lo administrativo exige
`aal2` en servidor y en RLS), una app shell responsive con tema claro/oscuro/sistema sin parpadeo, el
design system de tokens documentado en `/design`, el panel de superadmin (invitaciones, solicitudes,
organizaciones con cuotas y suspensión, consumo de IA agregado) y una landing pública con
"Solicitar acceso". Los correos (invitación y recuperación) se generan con React Email (HTML + texto
plano) y salen por SMTP (Resend en staging/producción, Mailpit local); la recuperación de contraseña
la gestiona Supabase Auth y su correo pasa por un Send Email Hook firmado. Detalle de decisiones en
[research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`) sobre Node.js 24 LTS; SQL (PostgreSQL 17 de Supabase) para migraciones, RLS y funciones.

**Primary Dependencies**: Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19.2, Tailwind CSS v4, shadcn/ui (Radix), lucide-react, Motion, `next/font`, `@supabase/ssr` + `@supabase/supabase-js`, Zod 4, React Email, nodemailer (SMTP), next-themes, sonner, vaul, cmdk, standardwebhooks, `@sentry/nextjs`, `@vercel/analytics`, `@vercel/speed-insights`. Justificación de cada dependencia nueva en [research.md §R1](./research.md#r1-stack-y-dependencias).

**Storage**: Supabase Postgres (RLS en todas las tablas; esquemas `public` expuesto y `private` no expuesto), Supabase Auth (contraseña + MFA TOTP), `pg_cron` para la retención diaria. Sin Storage ni pgvector en esta feature.

**Testing**: Vitest (unidad/dominio), pgTAP vía `supabase test db` (RLS, aislamiento, funciones, inmutabilidad de auditoría), Playwright + `@axe-core/playwright` (e2e a 360 px y escritorio, ambos temas), Lighthouse CI (`@lhci/cli`, perfil móvil), escaneo del bundle cliente en busca de secretos.

**Target Platform**: Web (Vercel, runtime Node.js) + Supabase gestionado; navegadores: dos últimas versiones de Chrome, Edge, Safari y Firefox en escritorio y móvil.

**Project Type**: Aplicación web full-stack (un solo proyecto Next.js con backend en Server Actions/Route Handlers y lógica crítica en funciones Postgres).

**Performance Goals**: Lighthouse móvil Performance ≥ 90 y Accessibility = 100 en landing, inicio de sesión y app shell; LCP < 2,5 s y CLS < 0,1 en 4G; p95 de páginas principales < 3 s.

**Constraints**: WCAG 2.2 AA (360 px, solo teclado, foco visible, 44 px, `prefers-reduced-motion`); prohibido estilizar fuera de los tokens; secretos solo en servidor (`server-only`); sin PII en logs; herramientas gratuitas por defecto; sin llamadas a IA en esta feature.

**Scale/Scope**: Etapa inicial: ≤ 5 superadmins, decenas a pocos cientos de vendedores/organizaciones personales; ~22 pantallas (públicas, auth, app, admin, `/design`, 404/error); 12 tablas en `public` + 1 tabla privada de rate limiting.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Aislamiento multiempresa** | Tablas de negocio (`memberships`, `teams`, `quotas`, `ai_usage`) con `organization_id NOT NULL` + FK + índice. RLS activo en **todas** las tablas de `public` (y también en `private`). Helpers `private.active_org_ids()` / `private.has_org_role()` / `private.is_operative_user()` con verificación de organización activa y sesión válida. Autorización en servidor (guards `requireUser`, `requireOrgMember`, `requireSuperadmin`) antes de cada operación, sin confiar en ids del navegador. pgTAP: prueba guardiana (toda tabla con RLS; toda tabla de negocio con `organization_id` indexado, con lista explícita de tablas de plataforma) + suite de aislamiento A/B; Playwright: suite e2e de aislamiento A/B (AC-01). | ✅ |
| **II. Seguridad y privacidad** | Clave secreta de Supabase y SMTP solo en `src/lib/**/server` con `import "server-only"`; escaneo del bundle en CI. MFA TOTP obligatorio para `superadmin` con `aal2` exigido en servidor y RLS; `admin_empresa` no se asigna en esta etapa. `audit_logs` inmutable (sin políticas de escritura + trigger que bloquea UPDATE/DELETE). Zod en toda entrada externa: Server Actions, Route Handlers (`/auth/confirm` y Send Email Hook) y parámetros de ruta/búsqueda (`[token]`, `?solicitud`, `?next`, periodos). Rate limiting en servidor en todas las Server Actions (ámbitos específicos + `user_mutation`; tabla privada, claves HMAC sin PII) y límites nativos de Supabase Auth, idempotencia en activación, formato de error `ActionResult` sin detalles internos. Webhook (Send Email Hook) con firma Standard Webhooks, tolerancia de timestamp de 5 min y deduplicación por `webhook-id` (anti-replay). Sentry con `beforeSend` que elimina PII y tokens de URL. Política de retención escrita: solicitudes (FR-049a) y auditoría 24 meses ([research.md §R11](./research.md#r11-auditoría-inmutable-y-retención)). | ✅ |
| **III. IA responsable** | Sin invocaciones de IA. Se deja `ai_usage` con el esquema exigido (org, usuario, tarea, modelo, tokens, latencia, costo) y `quotas` listas para que 002 verifique cuota antes de llamar al modelo. | ✅ (N/A parcial) |
| **IV. UX/UI de excelencia** | Tokens en `src/styles/tokens.css` (Tailwind v4 `@theme`, paleta por defecto de Tailwind eliminada con `--color-*: initial`) + regla de lint contra colores/valores literales; prueba Vitest de contraste AA para cada par declarado en ambos temas; Bricolage Grotesque + Figtree con `next/font`; estados vacío/carga/error/sin permiso/éxito por pantalla; Playwright + axe en móvil y escritorio; Lighthouse CI; es-PE y fechas en la zona horaria de la organización (en orgs `personal` se sincroniza con la del perfil mediante `update_my_profile`; el superadmin sin org usa la de su perfil). Moneda: el costo de IA se muestra en USD (`US$`) por ser moneda del proveedor (spec, Assumptions); `S/` se usará en 002. | ✅ |
| **V. Calidad verificable** | Pirámide completa (Vitest, pgTAP, Playwright+axe); CI en GitHub Actions bloqueante (lint, typecheck, unit, db, e2e, lighthouse, bundle-secrets); preview Vercel por PR; trazabilidad historia → AC → prueba en `tasks.md`. Dataset dorado: N/A (sin IA). | ✅ |
| **VI. Simplicidad** | Un solo proyecto Next.js; sin colas, Redis ni servicios extra: rate limiting y retención con Postgres + `pg_cron`. Cada dependencia nueva justificada en [research.md §R1](./research.md#r1-stack-y-dependencias). Sin `react-hook-form`, `date-fns` ni librerías de QR (Intl nativo, QR que devuelve Supabase). Turnstile/CAPTCHA pospuesto (honeypot + tiempo mínimo + rate limit). | ✅ |
| **VII. Versionado y migraciones** | Esquema solo por migraciones de Supabase CLI en `supabase/migrations/`, `seed.sql` de desarrollo, `supabase db reset` en CI y plan de rollback por migración (migración inversa documentada en el encabezado). Documentos legales versionados (`legal_documents`) y aceptaciones que referencian la versión aceptada. | ✅ |
| **Restricciones técnicas** | Stack conforme. Desviaciones justificadas abajo: (1) correo de recuperación vía Send Email Hook (en lugar de SMTP directo de Supabase Auth), manteniendo Resend como proveedor SMTP; (2) invitaciones propias en lugar de `inviteUserByEmail` de Supabase Auth. | ⚠️ justificada |

**Resultado del gate (pre-Phase 0)**: PASA, con cuatro desviaciones justificadas en *Complexity Tracking* (la cuarta, el riesgo residual de FR-023 ante llamadas directas a la API de Auth, se añadió tras `/speckit-analyze`).

**Re-evaluación post-Phase 1**: PASA. El modelo de datos ([data-model.md](./data-model.md)) mantiene `organization_id NOT NULL` indexado en todas las tablas de negocio; las tablas sin `organization_id` son datos de plataforma explícitos (listados en la prueba guardiana). Los contratos ([contracts/](./contracts/)) exigen guard de servidor + RLS en cada operación, Zod en cada entrada y auditoría en cada acción sensible. No aparecieron dependencias nuevas durante el diseño.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md              # Este archivo
├── research.md          # Phase 0: decisiones técnicas
├── data-model.md        # Phase 1: tablas, RLS, funciones, estados
├── quickstart.md        # Phase 1: guía de validación end-to-end
├── contracts/
│   ├── routes.md          # Rutas UI, acceso por rol y estados
│   ├── server-actions.md  # Server Actions: entrada Zod, guard, rate limit, auditoría, errores
│   ├── database-rpc.md    # Funciones Postgres expuestas y privadas, grants
│   └── emails.md          # Correos transaccionales e interfaz del Send Email Hook
├── checklists/
└── tasks.md             # Phase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (public)/                 # landing, /solicitar-acceso, /terminos, /privacidad, /aviso-ia
│   ├── (auth)/                   # /iniciar-sesion, /recuperar-contrasena, /restablecer-contrasena,
│   │                             # /invitacion/[token], /mfa/registrar, /mfa/verificar, /acceso-suspendido
│   ├── (app)/                    # app shell autenticada
│   │   ├── inicio/  onboarding/  perfil/
│   │   ├── admin/                # invitaciones/, solicitudes/, organizaciones/, consumo/
│   │   └── design/               # /design (solo superadmin aal2)
│   ├── auth/confirm/route.ts     # verifyOtp (recuperación) → /restablecer-contrasena
│   ├── api/auth/send-email/route.ts  # Supabase Send Email Hook (firmado)
│   ├── not-found.tsx  error.tsx  global-error.tsx  layout.tsx
├── components/
│   ├── ui/                       # shadcn/ui personalizados con tokens + gauge, score-ring, empty-state…
│   ├── app-shell/                # top bar, nav por rol, bottom nav móvil, menú de cuenta, skip link
│   └── brand/
├── features/                     # por dominio: schemas.ts (Zod), actions.ts, queries.ts (server-only), components/
│   ├── auth/  invitations/  access-requests/  organizations/  usage/  profile/  onboarding/  legal/
├── lib/
│   ├── supabase/                 # server.ts (usuario), admin.ts (secret key, server-only), proxy.ts
│   ├── auth/                     # guards.ts, session-policy.ts, request-context.ts
│   ├── security/                 # rate-limit.ts, password-policy.ts, tokens.ts, hmac.ts
│   ├── email/                    # transport.ts (nodemailer), send.ts
│   ├── audit.ts  action-result.ts  format.ts (Intl es-PE)  initials.ts
├── emails/                       # plantillas React Email (invitation, password-recovery)
├── styles/                       # tokens.css, globals.css
└── proxy.ts                      # refresco de sesión + CSP nonce + redirecciones optimistas
content/legal/                    # términos, aviso IA y privacidad versionados (borradores v0.x)
supabase/
├── config.toml                   # signup off, MFA TOTP, min password 10, hook, pg_cron, SMTP local
├── migrations/                   # esquema, RLS, funciones, cron
├── seed.sql                      # docs legales, superadmin y dos orgs de prueba (solo local)
└── tests/database/               # pgTAP
scripts/ops/                      # create-superadmin.ts, reset-superadmin-mfa.ts (+ README operativo)
tests/
├── unit/                         # Vitest
└── e2e/                          # Playwright + axe (+ fixtures de orgs A/B, lector de Mailpit)
.github/workflows/ci.yml
```

**Structure Decision**: un único proyecto Next.js en la raíz (`src/`), con la lógica de autorización
crítica duplicada a propósito en servidor (`src/lib/auth/guards.ts`) y en la BD (RLS + funciones en
`supabase/migrations/`). Organización por *features* para que 002 añada `src/features/practice/` sin
tocar la base. Rutas visibles en español (son parte de la UI); código e identificadores en inglés.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `audit_logs.organization_id` es **nullable** (tabla con eventos de plataforma) | Hay eventos sin organización: inicios de sesión de superadmin, restablecimiento de MFA, solicitudes de acceso, invitaciones previas a crear la org (spec, Key Entities). Se clasifica como tabla de plataforma, con índice `(organization_id, occurred_at)` y sin lectura para miembros. | Una organización "plataforma" ficticia mezclaría datos de plataforma con el modelo de tenants y complicaría RLS y el panel de organizaciones. |
| Correo de recuperación vía **Send Email Hook** + SMTP propio en vez de las plantillas SMTP nativas de Supabase Auth | FR-051 exige versión en texto plano y compatibilidad en modo oscuro; las plantillas nativas solo envían HTML y viven fuera del design system. El hook permite además aplicar el límite de 3 recuperaciones/correo/hora (FR-023) incluso si se llama a la API de Auth directamente. Resend sigue siendo el proveedor SMTP. | SMTP nativo: sin texto plano, plantillas Go separadas de React Email y sin forma de aplicar nuestro rate limit a llamadas directas a `/recover`. |
| Invitaciones propias (token aleatorio hasheado en `invitations`) en lugar de las nativas de Supabase Auth | FR-007…FR-016 exigen plazo de 1–30 días, reenvío que invalida el enlace anterior, revocación, estado derivado y crear la cuenta solo al aceptar. Supabase Auth sigue gestionando contraseñas, sesiones y MFA. | `inviteUserByEmail`: el enlace vence con el OTP global (máx. 24 h), no permite reenviar invalidando ni revocar, y crea el usuario antes de aceptar (research.md §R4). |
| Los límites por cuenta y de TOTP de FR-023 no cubren llamadas directas a la API pública de Supabase Auth (`/token`, `/factors/verify`) | Los hooks de verificación de contraseña y de MFA que permitirían aplicar nuestros límites a esas llamadas solo existen en los planes Team/Enterprise. Mitigación: límites nativos `sign_in_sign_ups` y `token_verifications` estrictos por IP (`supabase/config.toml` y dashboard), política de contraseñas fuertes (FR-014), auditoría de cada `superadmin.login` (FR-027) y sesión de superadmin de 12 h (FR-019). Riesgo residual aceptado y declarado en FR-023 (research.md §R9). | Plan de pago de Supabase: costo no justificado en esta etapa (Principio VI). Proxy propio delante de Auth: infraestructura adicional y no impide el uso de la clave publicable contra la API pública. |
