# Creando Valor IA™

Plataforma de entrenamiento comercial con compradores simulados por IA. Esta primera feature
(`specs/001-platform-foundation`) entrega la fundación: invitaciones y activación de cuentas,
organizaciones personales, sesión y MFA del superadmin, app shell, onboarding, perfil, administración
de organizaciones y consumo, landing con "Solicitar acceso" y design system.

Especificación, plan y contratos: [`specs/001-platform-foundation/`](specs/001-platform-foundation/).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS v4 (tokens) · Radix UI ·
Supabase (Postgres 17 + RLS, Auth con MFA TOTP, `pg_cron`) · Zod 4 · React Email + SMTP (Resend) ·
Sentry · Vitest · Playwright + axe · pgTAP · Lighthouse CI · Vercel.

## Requisitos

- Node.js 24 LTS (`.nvmrc`) y pnpm.
- Docker Desktop en ejecución (stack local de Supabase).
- Una app autenticadora TOTP para entrar como superadmin.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local      # completa con los valores de `pnpm supabase status`
cp supabase/.env.example supabase/.env   # SEND_EMAIL_HOOK_SECRET igual que en .env.local
pnpm supabase start             # Postgres, Auth y Mailpit (http://127.0.0.1:54324)
pnpm supabase db reset          # migraciones + seed (documentos legales, superadmins, orgs A–E)
pnpm dev                        # http://localhost:3000
```

Cuentas sembradas (solo local/CI): ver `supabase/seed.sql` y `tests/e2e/fixtures/seed-data.ts`.
Guía completa de validación: [`quickstart.md`](specs/001-platform-foundation/quickstart.md).

## Variables de entorno

Plantilla comentada en [`.env.example`](.env.example). Resumen:

| Variable                                                           | Ámbito       | Uso                                                               |
| ------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público      | Cliente de Supabase                                               |
| `NEXT_PUBLIC_SITE_URL`                                             | público      | URLs absolutas (correos, redirecciones)                           |
| `NEXT_PUBLIC_SUPPORT_EMAIL`                                        | público      | Contacto para cuentas suspendidas                                 |
| `NEXT_PUBLIC_SENTRY_DSN`                                           | público      | Sentry en el navegador (opcional)                                 |
| `SUPABASE_SECRET_KEY`                                              | servidor     | Admin API, aceptación de invitaciones, rate limit, auditoría      |
| `SEND_EMAIL_HOOK_SECRET`, `SEND_EMAIL_HOOK_URI`                    | servidor     | Hook de correo de Supabase Auth                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`   | servidor     | Envío de correos (Mailpit local, Resend en producción)            |
| `RATE_LIMIT_PEPPER`                                                | servidor     | HMAC de claves de rate limit y marcas de tiempo firmadas          |
| `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`  | servidor     | Errores y source maps                                             |
| `E2E_EMAIL_FAIL_DOMAIN`                                            | solo pruebas | Fuerza fallos de envío; `src/lib/env.ts` la rechaza en producción |
| `AI_PROVIDER`                                                      | servidor     | `google` (proveedores reales) o `fake` (determinista, pruebas)    |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`                     | servidor     | Claves de Gemini y Groq (capas gratuitas: solo datos ficticios)   |
| `AI_MODEL_BUYER_SETUP`, `AI_MODEL_BUYER`, `AI_MODEL_EVALUATOR`     | servidor     | Cadena `proveedor:modelo` por tarea, con failover                 |
| `PRACTICE_DISPATCH_SECRET`                                         | servidor     | Bearer del despachador interno de evaluaciones (≥ 32 bytes)       |

Las variables de servidor nunca llevan prefijo `NEXT_PUBLIC_`; `pnpm check:bundle-secrets` verifica
que ningún valor secreto llegue a `.next/static`.

## Scripts

| Script                                   | Qué hace                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Desarrollo, build y servidor de producción                                                  |
| `pnpm lint` / `pnpm typecheck`           | ESLint (incluye la regla de tokens) y TypeScript                                            |
| `pnpm test`                              | Vitest (esquemas, formato, contraste, correos…)                                             |
| `pnpm supabase test db`                  | pgTAP: RLS, aislamiento, aal2, auditoría, retención, guards `admin_*`                       |
| `pnpm test:e2e`                          | Playwright + axe en 360 px y escritorio × claro y oscuro (construye y arranca la app)       |
| `pnpm lhci`                              | Lighthouse móvil: landing, login, Hoy, productos, historial y un resultado (app en `:3000`) |
| `pnpm check:bundle-secrets`              | Busca secretos en el bundle del cliente (tras `pnpm build`)                                 |
| `pnpm email:dev`                         | Vista previa de las plantillas de correo                                                    |
| `pnpm test:golden`                       | Dataset dorado del evaluador: offline siempre; en vivo con `GOOGLE_GENERATIVE_AI_API_KEY`   |
| `pnpm prompts:lock`                      | Añade a `prompts.lock.json` el hash de las versiones de prompt nuevas                       |

Regenerar tipos tras una migración:
`pnpm -s supabase gen types typescript --local > src/lib/supabase/database.types.ts`.

## IA de la práctica (002)

- **Proveedor**: un único adaptador (`src/features/practice/ai/`) elige el proveedor con
  `AI_PROVIDER`. `fake` es determinista (sin red ni clave) y lo usan Vitest y todas las e2e; acepta
  marcadores de prueba como `[[e2e:eval-falla]]` o `[[e2e:eval-lenta:N]]` en el texto del vendedor.
  `google` usa Gemini con los modelos de `AI_MODEL_*`.
- **Dataset dorado** (`tests/golden/`): casos con rangos esperados por criterio, alertas éticas y
  conversaciones de inyección. `pnpm test:golden` valida offline las evaluaciones grabadas; con clave
  de Gemini ejecuta además el evaluador real. `.github/workflows/golden.yml` lo corre en vivo en PRs
  que tocan prompts, esquemas de IA o el dataset, cada lunes y a demanda (nunca contra la base de
  producción).
- **Bloqueo de prompts** (research.md §R3): `src/features/practice/ai/prompts/prompts.lock.json`
  guarda el SHA-256 de cada versión de prompt. Un texto nuevo exige subir su `PROMPT_VERSION` y
  ejecutar `pnpm prompts:lock` (nunca reescribe versiones ya bloqueadas); la prueba unitaria falla si
  un texto cambia bajo una versión bloqueada, para que todo cambio pase por el dataset dorado.
- **Despachador de evaluaciones**: `pg_cron` ejecuta `private.run_practice_maintenance()` cada minuto
  y envía con `pg_net` las evaluaciones pendientes a `POST /api/internal/practice/evaluations`
  (Bearer `PRACTICE_DISPATCH_SECRET`). URL y secreto viven solo en Supabase Vault; localmente los
  carga `supabase/seed.sql` y en producción `scripts/ops/set-practice-dispatch.ts` (ver
  [`scripts/ops/README.md`](scripts/ops/README.md)).
- **Piloto en capas gratuitas, con failover** (research.md §R16, constitución v1.1.0).
  - Cada tarea tiene una cadena `AI_MODEL_*` de entradas `proveedor:modelo`, que se prueban en
    orden ante 429/5xx, sin espera al cambiar de modelo.
  - Las entradas sin clave se omiten; cada tarea necesita al menos una utilizable.
  - Por defecto:
    - comprador: `google:gemini-3.5-flash-lite` y, de respaldo, `groq:openai/gpt-oss-120b`;
    - ficha y evaluación: Groq primero y Gemini después.
  - Límites gratuitos medidos: Gemini permite 20 solicitudes al día por modelo en `3.6-flash` y
    da 503 frecuentes; Groq, unas 1.000 al día por modelo.
  - Groq no hace streaming con salida estructurada: sus turnos llegan completos, en ~1 s.
  - **Solo datos ficticios** en cualquier capa gratuita.
  - Pasar a pago antes de abrir el acceso cuesta ≈ US$ 0,09 por práctica con Gemini, o menos con
    Groq. Solo cambian claves y variables, no el código.
- **Modelos**: la familia 2.5 de Gemini está cerrada a proyectos nuevos. Gemini 3 usa
  `thinkingLevel` (el comprador usa `minimal`, que `gemini-3.8-flash` no acepta) y Groq usa
  `reasoningEffort`.

### Medición de los criterios de éxito (quickstart.md)

```sql
-- SC-007: primer fragmento del comprador < 2,5 s (p95, últimos 7 días)
select percentile_cont(0.95) within group (order by first_chunk_ms)
  from ai_usage
 where task = 'buyer' and outcome = 'success' and created_at > now() - interval '7 days';

-- SC-008: 95 % de las evaluaciones listas en < 60 s desde el fin de la práctica
select avg((e.created_at - s.ended_at < interval '60 seconds')::int) as share_under_60s
  from practice_evaluations e
  join practice_sessions s on s.id = e.session_id
 where e.created_at > now() - interval '7 days';

-- SC-012: el consumo diario por organización nunca supera la cuota
select c.organization_id, date_trunc('day', c.consumed_at) as day, count(*), q.daily_limit
  from simulation_consumptions c
  join quotas q on q.organization_id = c.organization_id
 group by 1, 2, q.daily_limit
having count(*) > q.daily_limit;  -- debe devolver 0 filas
```

## Operación

- Alta de superadmins y reset de MFA: [`scripts/ops/README.md`](scripts/ops/README.md).
- Trabajos `pg_cron` diarios (UTC): purga de `rate_limit_events` (08:10) y retención de solicitudes
  de acceso (08:15).

### Política de retención (research.md §R11)

| Datos                       | Retención                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `audit_logs`                | 24 meses desde `occurred_at` (purga pendiente, ver abajo)                                   |
| `access_requests`           | `nueva` > 180 días → descartada; descartada > 90 días → anonimizada; `invitada` se conserva |
| `private.rate_limit_events` | 7 días                                                                                      |

## Entornos

`local` (`supabase start`, también en CI) y `production` (un único proyecto Supabase, sin staging).
Vercel despliega producción desde `main` (framework Next.js, Node 24) y tiene las preview deployments
deshabilitadas en la configuración del proyecto, porque no tendrían base de datos y nunca deben apuntar a la de producción. La validación antes del merge es local + CI
(research.md §R22).

### Aprovisionamiento de producción (una vez)

1. **Supabase**: en el proyecto de producción habilitar MFA TOTP; dejar el registro
   público deshabilitado; aplicar la configuración de Auth versionada con `supabase config push`
   (URLs de redirección, `max_frequency`, `email_sent`); en el dashboard fijar estrictos los límites
   nativos por IP `sign_in_sign_ups` y `token_verifications` (research.md §R9).
2. **Migraciones**: `supabase link --project-ref <ref>` y `supabase db push` (activa `pg_cron` y los
   trabajos diarios). Nunca ejecutar `supabase/seed.sql` en producción: crea usuarios de prueba con una
   contraseña conocida.
3. **Documentos legales**: insertar en `public.legal_documents` la versión vigente de `terms`,
   `ai_notice` y `privacy` (sin ellos no se puede activar una cuenta ni solicitar acceso). Los
   borradores `0.1-borrador` de `content/legal/` se cargaron en producción el 2026-11-23 con
   `is_draft = true` y `effective_at = now()`. Para una versión nueva: añadir el `.md` en
   `content/legal/`, desplegar y luego insertar la fila (los usuarios vuelven a aceptar).
4. **Hook de correo**: Auth → Hooks → Send Email apuntando a `https://<dominio>/api/auth/send-email`
   con el mismo `SEND_EMAIL_HOOK_SECRET` que la app.
5. **Resend**: verificar el dominio (SPF, DKIM y DMARC en el DNS) y usar sus credenciales SMTP.
6. **Vercel**: vincular el repositorio; cargar las variables de `.env.example` solo en el entorno
   Production; nunca definir `E2E_EMAIL_FAIL_DOMAIN`.
7. Dar de alta el primer superadmin con `scripts/ops/create-superadmin.ts`.

## Integración continua y protección de `main`

`.github/workflows/ci.yml` ejecuta en cada PR los jobs `lint`, `typecheck`, `unit`, `build` (con
`bundle-secrets`), `db` (pgTAP), `e2e` (Playwright con reporte como artefacto) y `lighthouse`
(reportes como artefacto).

La rama `main` debe protegerse (Principio V) con PR obligatorio, rama actualizada antes del merge y
todos esos checks como obligatorios. Configuración (requiere permisos de administración del repo):

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "unit", "build", "db", "e2e", "lighthouse"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

Verificación:

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --jq '{strict: .required_status_checks.strict, checks: .required_status_checks.contexts, pr: (.required_pull_request_reviews != null)}'
```

Debe mostrar `strict: true`, los siete checks y `pr: true`. Un push directo a `main` debe ser
rechazado.

## Pendientes operativos

- **Purga de `audit_logs`** (research.md §R11): implementarla antes de que el primer registro de
  producción cumpla **22 meses** (margen de 2 meses sobre la retención de 24). Fecha límite = fecha
  del primer despliegue a producción + 22 meses. **Primer despliegue: 2026-11-24 → límite:
  2028-09-24.**
- **Resend** (diferido al cierre del proyecto): verificar el dominio, cargar `SMTP_PASS` (API key) y el
  `EMAIL_FROM` definitivo en Vercel. Hasta entonces la app funciona pero no envía correos
  (invitaciones y recuperación muestran el error de envío con "Reintentar").
- **Primer superadmin** en producción con `scripts/ops/create-superadmin.ts` (ver
  `scripts/ops/README.md`).
- **Validación con personas** (T175, T177, T184): requieren Resend; se hacen en producción antes de
  abrir el acceso.
- **Costos** (research.md §R22): el lanzamiento comercial requiere Vercel Pro; se recomienda Supabase
  Pro en producción (backups y controles de sesión nativos).
