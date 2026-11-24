# Research: Fundación de la plataforma Creando Valor IA™

**Feature**: `001-platform-foundation` | **Fecha**: 2026-11-23 | **Plan**: [plan.md](./plan.md)

Cada sección sigue el formato *Decisión / Razón / Alternativas consideradas*. No quedan
"NEEDS CLARIFICATION" abiertos: el Technical Context del plan se resolvió con estas decisiones.

---

## R1. Stack y dependencias

**Decisión**: Next.js 16 (App Router) + React 19.2 + TypeScript strict sobre Node 24 LTS; Tailwind v4 +
shadcn/ui (Radix); Supabase vía `@supabase/ssr`. Versiones exactas fijadas en `package.json` al
iniciar la implementación (última estable de cada una). Dependencias nuevas y su justificación
(Principio VI):

| Dependencia | Uso | Por qué / alternativa gratuita descartada | Costo |
|---|---|---|---|
| `next`, `react`, `react-dom`, `typescript` | Aplicación | Stack constitucional | 0 |
| `@supabase/ssr`, `@supabase/supabase-js` | Auth, datos, admin API | Stack constitucional | 0 |
| `tailwindcss` v4, `@tailwindcss/postcss` | Estilos por tokens | Stack constitucional | 0 |
| `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` | Base de shadcn/ui | Requeridas por shadcn/ui | 0 |
| `lucide-react` | Iconos | Stack constitucional | 0 |
| `motion` | Animaciones puntuales (anillo de puntaje, gauge) | Stack constitucional; CSS para el resto | 0 |
| `zod` | Validación servidor/cliente | Constitución II | 0 |
| `next-themes` | Tema claro/oscuro/sistema sin parpadeo | Script inline propio posible, pero `next-themes` es el estándar de shadcn y resuelve FOUC, `system` en vivo y sincronía entre pestañas | 0 |
| `sonner` | Toast | Componente toast oficial de shadcn | 0 |
| `vaul` | Bottom-sheet móvil | Componente drawer oficial de shadcn, accesible y con gestos | 0 |
| `cmdk` | Combobox con buscador (zona horaria) | `<datalist>` nativo tiene accesibilidad inconsistente entre navegadores | 0 |
| `@react-email/components` (+ render) | Plantillas de correo HTML + texto plano | HTML a mano no garantiza compatibilidad en clientes de correo (FR-051) | 0 |
| `nodemailer` | Envío SMTP (Resend / Mailpit) | Un solo transporte para producción y local; el SDK HTTP de Resend no permite usar Mailpit local | 0 (Resend free: 3.000/mes) |
| `standardwebhooks` | Verificar firma del Send Email Hook | Implementación propia de HMAC + tolerancia es propensa a errores | 0 |
| `server-only` | Marcar módulos con secretos | Constitución II | 0 |
| `@sentry/nextjs` | Errores | Stack constitucional (plan Developer gratuito) | 0 |
| `@vercel/analytics`, `@vercel/speed-insights` | Analítica y Web Vitals | Stack constitucional; Web Vitals en preview | 0 |
| Dev: `vitest`, `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `supabase` (CLI), `tsx`, `eslint`, `eslint-config-next`, `prettier`, `@types/nodemailer` | Pruebas, CI, scripts operativos | Pirámide de pruebas constitucional | 0 |

**Razón**: el stack es el de la constitución; solo se añaden piezas pequeñas sin alternativa nativa
razonable.

**Alternativas consideradas**: `react-hook-form` (descartado: `useActionState` + Zod basta para
formularios simples); `date-fns`/`luxon` (descartado: `Intl` nativo cubre formato y zonas horarias);
librería de QR (descartado: `supabase.auth.mfa.enroll` ya devuelve el QR en SVG); Redis/Upstash
para rate limiting (descartado: Postgres basta a esta escala).

---

## R2. Estructura del proyecto

**Decisión**: un solo proyecto Next.js en la raíz con `src/app` (rutas agrupadas `(public)`, `(auth)`,
`(app)`), `src/features/<dominio>` (schemas, actions, queries, components), `src/lib` (infraestructura
transversal) y `supabase/` (migraciones, seed y pgTAP). Rutas visibles en español.

**Razón**: mínima estructura que separa dominio de infraestructura y deja que 002 se añada como
`src/features/practice` sin reorganizar.

**Alternativas consideradas**: monorepo con Turborepo (`apps/web`, `packages/db`): innecesario para
una sola app (Principio VI). Rutas en inglés: las URLs forman parte de la UI en español.

---

## R3. Capas de autorización y acceso a datos

**Decisión**: tres capas complementarias.

1. **Guards de servidor** (`src/lib/auth/guards.ts`): `getRequestContext()` (cacheado por petición
   con `React.cache`) llama a una sola función `public.get_request_context()` que devuelve usuario,
   validez de la sesión (R7), nivel AAL, si es superadmin y sus pertenencias activas con el estado de
   cada organización. Sobre ella: `requireUser()`, `requireOrgMember(orgId, roles?)`,
   `requireSuperadmin()` (exige `aal2`). Todas las Server Actions y páginas privadas llaman a un guard
   antes de cualquier operación.
2. **RLS en todas las tablas** con helpers `security definer` en el esquema `private`
   (`private.active_org_ids()`, `private.has_org_role()`, `private.is_superadmin()`,
   `private.current_session_ok()`), envueltos en `(select …)` para que se evalúen una vez por
   consulta.
3. **Funciones Postgres para mutaciones compuestas** (`security definer`, `search_path = ''`) que
   repiten la verificación de permisos internamente y escriben la auditoría en la misma transacción
   (p. ej., `admin_update_quota`). Los clientes nunca insertan directamente en `audit_logs`.

El cliente con la **clave secreta** (`src/lib/supabase/admin.ts`, `server-only`) se usa solo para:
Auth Admin API (crear usuario al aceptar invitación), `accept_invitation`, envío de solicitudes de
acceso, rate limiting, auditoría de eventos previos a `aal2` (fallos de TOTP) y el hook de correo.
Todo lo demás usa el cliente con la sesión del usuario, sujeto a RLS.

**Razón**: cumple Principio I (autorización en servidor + RLS como defensa adicional) y concentra en
transacciones las operaciones que deben ser atómicas y auditadas.

**Alternativas consideradas**: solo RLS (prohibido por la constitución); usar siempre la clave
secreta con autorización solo en TS (pierde la defensa en profundidad); `app_metadata` en el JWT para
marcar superadmin (su revocación tarda hasta el siguiente refresh; se prefiere la tabla
`platform_admins`).

---

## R4. Invitaciones y activación atómica

**Decisión**: invitaciones propias (no `auth.admin.inviteUserByEmail`).

- Token: 32 bytes aleatorios (`crypto.randomBytes`) en base64url; en la BD solo se guarda
  `sha256(token)`. Enlace: `/invitacion/{token}` con `Referrer-Policy: no-referrer`. Reenviar genera
  un token nuevo (el hash anterior se reemplaza, por lo que el enlace viejo deja de funcionar) y
  reinicia el plazo. "Reintentar envío" tras un fallo usa la misma operación de reenvío (sin el token
  en claro no puede reenviarse el mismo enlace).
- Idempotencia de reenvío y revocación (Principio II): cada diálogo de confirmación de reenvío genera
  una `idempotencyKey`; `admin_resend_invitation` bloquea la fila (`FOR UPDATE`) y, si la clave es la
  del último reenvío aplicado (`invitations.resend_idempotency_key`), no cambia el token ni audita, y
  la action no envía otro correo. Así un doble clic no invalida el enlace que acaba de llegar.
  Revocar una invitación ya revocada devuelve la misma confirmación sin auditar.
- Estado **derivado** (`pendiente | aceptada | vencida | revocada`) calculado por
  `public.invitation_status()` a partir de `accepted_at`, `revoked_at` y `expires_at`; nunca se
  persiste un estado que pueda quedar desfasado.
- Unicidad: índice único parcial de una invitación *abierta* (no aceptada ni revocada) por correo
  normalizado; si la abierta está vencida, la UI ofrece reenviarla.
- Activación (Server Action `activateAccount`): rate limit por IP → valida Zod y política de
  contraseña → busca la invitación por hash y la valida → `auth.admin.createUser({ email, password,
  email_confirm: true })` → `public.accept_invitation(...)` (una transacción: `SELECT … FOR UPDATE`
  de la invitación, revalidación de estado y vencimiento, actualiza perfil, crea organización
  personal con `name = full_name` y slug único generado en SQL por `private.slugify` (extensión
  `unaccent`, sufijo aleatorio ante colisión), pertenencia `vendedor` activa, cuota por defecto,
  aceptaciones legales de las versiones que la página mostró (sus ids viajan en el formulario y deben
  seguir vigentes; si no, `legal_outdated` y se vuelven a mostrar, FR-015),
  marca aceptada y audita) → `signInWithPassword` en el servidor (cookies) → redirección a
  `/onboarding`. Si `accept_invitation` falla, se elimina el usuario recién creado (compensación),
  pero solo si sigue siendo huérfano (sin pertenencias): así nunca se borra una cuenta que otra
  petición concurrente ya activó.
- Cuenta huérfana (la compensación no llegó a ejecutarse, p. ej., caída del proceso): si
  `createUser` falla porque el correo existe y esa cuenta es huérfana (sin pertenencias, no
  superadmin, sin invitación aceptada) con el correo de la invitación, se reutiliza
  (`auth.admin.updateUserById` con la nueva contraseña → `accept_invitation`). `accept_invitation`
  exige que `p_user_id` sea huérfano y tenga el correo de la invitación. Así la persona nunca queda
  bloqueada (FR-016) y `admin_create_invitation` no la trata como `account_exists` (FR-010).
- Idempotencia/doble clic: el `FOR UPDATE` serializa; el segundo intento encuentra la invitación
  aceptada (o una cuenta no huérfana) y responde "invitación ya usada → iniciar sesión", sin crear
  nada más. El botón se deshabilita mientras `pending`.
- Registro abierto deshabilitado en Supabase Auth (`enable_signup = false`); la creación de usuarios
  solo es posible con la Admin API desde el servidor.

**Razón**: el enlace nativo de Supabase vence con el OTP global (máx. 24 h), no soporta reenvío con
invalidación ni revocación, y crea el usuario antes de aceptar. Los requisitos de FR-007…FR-016
exigen control propio.

**Alternativas consideradas**: `inviteUserByEmail` (descartado por lo anterior); crear el usuario de
Auth dentro de la transacción SQL insertando en `auth.users` (no soportado, frágil ante cambios de
GoTrue).

---

## R5. Correos transaccionales

**Decisión**:

- Plantillas con **React Email** en `src/emails/` (invitación, recuperación), renderizadas a HTML y
  **texto plano**, con `color-scheme: light dark`, colores con contraste en ambos modos y sin depender
  de imágenes para el contenido.
- Transporte único **SMTP con nodemailer**: Resend SMTP en producción (dominio verificado
  con SPF/DKIM/DMARC en SiteGround DNS) y **Mailpit** del stack local de Supabase en desarrollo y CI
  (Playwright lee los enlaces por la API HTTP de Mailpit).
- **Invitación**: la envía directamente la Server Action tras crear/reenviar; el resultado se guarda
  en `invitations.send_status` (`sent | failed`) para FR-013.
- **Recuperación**: la gestiona Supabase Auth (`resetPasswordForEmail`, token de un solo uso,
  `otp_expiry = 3600` s = 60 min). Supabase llama al **Send Email Hook** HTTP
  (`POST /api/auth/send-email`), que verifica la firma Standard Webhooks (secreto `v1,whsec_…`,
  tolerancia de 5 min + deduplicación por `webhook-id` → anti-replay), aplica el límite de 3 correos por dirección por hora (R9) y
  envía la plantilla con enlace `/auth/confirm?token_hash=…&type=recovery&next=/restablecer-contrasena`.
  El Route Handler `/auth/confirm` valida la query con Zod (`authConfirmParams`: `token_hash`
  base64url ≤ 256, `type` literal `recovery`, `next` interno vía `safe-next.ts`) antes de `verifyOtp`;
  si no valida, redirige a `/recuperar-contrasena?estado=enlace-invalido`.
  Tipos de correo distintos de `recovery` se rechazan (no deberían ocurrir con registro y cambio de
  correo deshabilitados).

**Razón**: FR-051 (texto plano, claro/oscuro) y una sola fuente de diseño para todos los correos. El
hook cubre también llamadas directas a `/recover` de la API de Auth.

**Alternativas consideradas**: SMTP nativo de Supabase con plantillas Go (sin texto plano, fuera del
design system); tokens de recuperación propios (duplicaría lo que GoTrue ya hace bien y dejaría
`/recover` como canal paralelo sin marca).

**Riesgo**: el hook tiene un tiempo límite (~5 s); el envío SMTP a Resend suele tardar < 1 s. Si falla,
el usuario ve la misma confirmación genérica y puede reintentar.

---

## R6. Política de contraseñas (FR-014)

**Decisión**: validación en servidor (y espejo en cliente para el indicador en tiempo real):
mínimo 10 caracteres; distinta del correo (comparación normalizada, también contra la parte local);
no presente en una lista local de contraseñas comunes (top 10.000, de SecLists, licencia MIT,
empaquetada solo en servidor); no filtrada según **HIBP Pwned Passwords** (API de rango con
k-anonimato: solo se envían los 5 primeros caracteres del SHA-1, con `Add-Padding`). Si HIBP no
responde en 1,5 s se acepta con la verificación local (fail-open registrado como métrica, sin PII).
Supabase Auth se configura con `minimum_password_length = 10` como respaldo.

**Razón**: la "protección de contraseñas filtradas" nativa de Supabase es de plan de pago; HIBP es
gratuito, sin clave y no expone la contraseña.

**Alternativas consideradas**: solo lista local (no detecta filtraciones); `zxcvbn` (pesado para el
cliente y no responde a "filtrada").

---

## R7. Duración de sesión (FR-019)

**Decisión**: política aplicada por la app y por la BD, leyendo `auth.sessions` (columnas
`created_at`, `refreshed_at`, `aal`) mediante el `session_id` del JWT:

- Vendedor: vida máxima 30 días desde el inicio de sesión; inactividad máxima 7 días (sin refresh).
- Superadmin: vida máxima 12 horas.
- JWT de 1 hora (por defecto); `refreshed_at` aproxima la última actividad con granularidad ≤ 1 h.
- `private.current_session_ok()` evalúa la política y forma parte de todos los helpers de RLS, de
  modo que un refresh token reutilizado fuera de política no lee datos aunque se use la API
  directamente. `getRequestContext()` detecta la sesión vencida, llama a `signOut()` y redirige a
  `/iniciar-sesion?next=…` (ruta interna validada) para volver a la pantalla donde estaba.

**Razón**: "time-box" e "inactivity timeout" de Supabase Auth son de plan Pro; esto cumple FR-019 en
el plan gratuito. Si se migra a Pro, se configuran también los valores nativos (defensa adicional).

**Alternativas consideradas**: solo `maxAge` de cookie (no invalida el refresh token en el servidor);
tabla propia de sesiones (duplicaría `auth.sessions`).

---

## R8. MFA TOTP del superadministrador

**Decisión**: Supabase Auth MFA (TOTP, gratuito). Tras la contraseña, `getRequestContext()` decide:

- Superadmin sin factor verificado → solo `/mfa/registrar` (QR SVG de `mfa.enroll`, clave manual,
  verificación de un código) y cerrar sesión.
- Superadmin con factor y `aal1` → solo `/mfa/verificar`.
- Toda página `/admin/**` y `/design` y toda función administrativa exigen `aal2`:
  `requireSuperadmin()` en servidor y `private.is_superadmin()` (que comprueba
  `auth.jwt()->>'aal' = 'aal2'` y pertenencia a `platform_admins`) en RLS y en cada función `admin_*`.
- Auditoría: `superadmin.login` con `result = success | failure` (fallos de TOTP vía cliente
  administrativo, pues aún no hay `aal2`); `superadmin.mfa_enrolled` al registrar el factor.
- Restablecimiento (FR-027a): `scripts/ops/reset-superadmin-mfa.ts --email … --operator …` con la
  clave secreta: elimina factores (`auth.admin.mfa.deleteFactor`), revoca todas las sesiones
  (`private.revoke_user_sessions(uuid)`, solo `service_role`) y audita `superadmin.mfa_reset` con
  `actor_type = operator`. Sin UI.
- Alta de superadmins: `scripts/ops/create-superadmin.ts` (crea usuario con contraseña temporal,
  perfil y fila en `platform_admins`; el primer inicio obliga a registrar el factor).

**Razón**: FR-025…FR-027a con capacidades nativas y sin costo.

**Alternativas consideradas**: WebAuthn/passkeys (fuera de alcance de la spec); hook "MFA
verification attempt" de Supabase (solo planes Team/Enterprise).

---

## R9. Rate limiting (FR-023)

**Decisión**: tabla `private.rate_limit_events (scope, key_hash, occurred_at)` y función
`private.check_rate_limit(scope, key_hash, max, window, lockout)` que devuelve `allowed` y
`retry_after`. Las claves son HMAC-SHA256 con un *pepper* de servidor (`RATE_LIMIT_PEPPER`) del
correo normalizado o de la IP (`x-real-ip`/`x-forwarded-for` de Vercel): no se guarda PII. Limpieza
diaria con `pg_cron`.

**Confianza en la IP**: `x-real-ip`/`x-forwarded-for` solo son confiables detrás de Vercel, que los
sobrescribe con la IP real del cliente; la app no se despliega fuera de Vercel. En local y CI
(`next start` sin proxy) el cliente puede fijarlos, y las pruebas e2e lo usan a propósito para
aislarse entre sí (`uniqueClientIp()`, T059) o para probar un límite por IP con una IP fija propia.

| Ámbito | Clave | Límite | Bloqueo | Dónde |
|---|---|---|---|---|
| `login_account` | correo | 5 fallos / 15 min | 15 min desde el último fallo | `signIn` action |
| `login_ip` | IP | 20 fallos / 15 min | 15 min | `signIn` action |
| `mfa_verify` | user_id | 5 fallos / 15 min | 15 min | `verifyMfa` y `confirmMfaEnrollment` actions (contador compartido) |
| `recovery_email` | correo | 3 / hora | hasta salir de la ventana (sin envío, misma confirmación) | `requestPasswordReset` action (solo consulta) **y** Send Email Hook (consulta + registra al enviar) |
| `activation_ip` | IP | 10 / hora | hasta salir de la ventana | `activateAccount` action y consulta de `/invitacion/[token]` (`getInvitationForToken`: solo los tokens inexistentes registran evento) |
| `access_request_ip` | IP | 3 / hora | hasta salir de la ventana | `submitAccessRequest` action |
| `webhook_id` | webhook-id | 1 / 24 h | 24 h | Send Email Hook (anti-replay) |
| `user_mutation` | user_id | 60 / min | 1 min | toda Server Action autenticada sin ámbito propio (admin, perfil, onboarding, `resetPassword`, `enrollMfa`), aplicado en las variantes de Server Action de los guards; única excepción: `signOut` |

`/auth/confirm` queda cubierto por el límite nativo `token_verifications` de Supabase (T008) y valida
su query con Zod antes de llamar a Auth (Principio II).

**Límites nativos de Supabase Auth por entorno**:

- *Producción* (dashboard, T178): `sign_in_sign_ups` y `token_verifications` estrictos por
  IP (mitigación del riesgo residual de abajo); `[auth.email] max_frequency = "1s"` y
  `[auth.rate_limit] email_sent` ≥ 30/h, para que el límite propio de 3 recuperaciones por correo y
  hora del Send Email Hook sea el que gobierne (con el intervalo mínimo nativo por usuario de ~60 s,
  la 2.ª y la 3.ª solicitud legítimas de la hora no enviarían correo).
- *Local y CI* (`supabase/config.toml`, T008): los mismos `max_frequency` y `email_sent`, y
  `sign_in_sign_ups`/`token_verifications` holgados, porque la suite e2e (4 proyectos) llega a Auth
  siempre desde 127.0.0.1 y no debe tropezar con límites nativos; los límites de FR-023 que prueba
  la suite son los propios de esta tabla.

El mensaje indica cuándo reintentar ("Vuelve a intentarlo en 12 minutos") sin revelar si la cuenta
existe (el límite por cuenta se aplica igual a correos inexistentes).

**Riesgo residual documentado**: la API de Auth de Supabase es pública (clave publicable); un
atacante puede llamar `/token` o `/factors/verify` sin pasar por nuestras actions. Mitigaciones:
límites nativos de Supabase por IP configurados en `config.toml`/dashboard
(`sign_in_sign_ups`, `token_verifications`), la política de contraseñas fuertes y, para recuperación,
el hook (que sí cubre las llamadas directas). Los hooks de verificación de contraseña/MFA que
cerrarían el hueco son de planes Team/Enterprise. Riesgo aceptado: declarado en FR-023 y registrado
como desviación en *Complexity Tracking* del plan (con auditoría de `superadmin.login` y sesión de
12 h como mitigaciones adicionales).

**Alternativas consideradas**: Upstash Redis (servicio adicional, Principio VI); contadores en
memoria (no funcionan en serverless).

---

## R10. Suspensión de organizaciones (FR-024, FR-024a)

**Decisión**: `organizations.status` (`active | suspended`) + motivo, fecha y autor.
`private.active_org_ids()` solo devuelve organizaciones activas con pertenencia activa, por lo que
la RLS niega todo dato a un miembro de una organización suspendida en la siguiente consulta, sin
esperar a que caduque la sesión. `getRequestContext()` detecta que el usuario no tiene ninguna
pertenencia operativa y lo lleva a `/acceso-suspendido` (mensaje explicativo y contacto).
`activateAccount` y el inicio de sesión también verifican el estado.

**Razón**: efecto inmediato verificado en cada petición, en servidor y BD.

**Alternativas consideradas**: banear usuarios en Auth (`ban_duration`): afectaría su identidad
global y no al alcance por organización que necesitarán las etapas con empresas.

---

## R11. Auditoría inmutable y retención

**Decisión**: `audit_logs` con `actor_type` (`user | system | operator`), `actor_user_id`,
`actor_label`, `organization_id` (nullable: eventos de plataforma), `action`, `object_type`,
`object_id`, `data jsonb`, `result`, `occurred_at`. Sin políticas de INSERT/UPDATE/DELETE para
`authenticated`/`anon`; inserción solo desde funciones `security definer` y desde el servidor con la
clave secreta vía `private.write_audit(...)`; trigger `BEFORE UPDATE OR DELETE` que lanza excepción.
`data` nunca contiene contraseñas, códigos, tokens ni enlaces (helper TS y función SQL con lista
blanca de claves por acción). Catálogo de acciones en [data-model.md](./data-model.md#audit-actions).

**Política de retención (Principio II)**:

- `audit_logs`: 24 meses desde `occurred_at`; la purga (función con rol dedicado que desactiva el
  trigger solo para ella) queda fuera de esta feature y debe implementarse antes de que el primer
  registro de producción cumpla 22 meses (margen de 2 meses respecto de los 24). Pendiente registrado
  en `README.md` (sección "Pendientes operativos", con la fecha límite calculada desde el primer
  despliegue a producción) y en un issue de seguimiento en GitHub.
- `access_requests`: FR-049a (180 días → descartada; 90 días tras descarte → anonimizada).
- `private.rate_limit_events`: 7 días.
- Datos de cuenta y organización: mientras exista la cuenta (eliminación/exportación fuera de alcance
  en esta etapa).

---

## R12. Solicitudes de acceso: anti-abuso y retención

**Decisión**: formulario en `/solicitar-acceso` con Server Action que aplica: campo honeypot oculto,
tiempo mínimo de llenado (≥ 3 s, con marca de tiempo firmada con HMAC en un campo oculto), rate
limit 3/IP/hora y deduplicación por índice único parcial (`email` normalizado con `status = 'new'`
y sin anonimizar). La solicitud guarda la versión de la política de privacidad que se mostró
(`privacyDocumentId`, que debe seguir vigente al enviar). Ante duplicado se muestra la misma confirmación (no se revela existencia). La
inserción la hace el servidor con la clave secreta; `anon` no tiene permisos sobre la tabla (si los
tuviera, un bot podría saltarse el rate limit llamando a PostgREST).

Retención: `pg_cron` diario ejecuta `private.run_access_request_retention()`: (a) `new` con más de
180 días → `discarded` + auditoría `access_request.discarded` con `actor_type = system`;
(b) `discarded` con más de 90 días desde el descarte → anonimiza (nombre, correo, empresa y mensaje a
`NULL`, `anonymized_at = now()`); (c) `invited` se conserva.

**Razón**: protección suficiente sin scripts de terceros que afecten el Lighthouse de la landing.

**Alternativas consideradas**: Cloudflare Turnstile (gratuito, pero añade un script externo y
fricción; queda como escalamiento si aparece abuso); Vercel Cron (innecesario: `pg_cron` es nativo).

---

## R13. Cuotas y consumo de IA

**Decisión**: `quotas` 1:1 con organización (`daily_limit` 10, `monthly_limit` 100 por defecto;
`CHECK` enteros ≥ 0 y diaria ≤ mensual), creada en la misma transacción que la organización.
`ai_usage` con `simulation_id uuid` opcional (sin FK hasta que 002 cree la tabla de sesiones).
"Simulaciones" = `count(distinct simulation_id)`. Agregados por `admin_usage_summary(from, to)`
calculando los límites del periodo en la zona horaria de cada organización
(`(created_at at time zone o.timezone)::date`). Costos en `numeric(12,6)` USD, mostrados como `US$`
con `Intl.NumberFormat('es-PE')`. Ninguna función ni vista administrativa toca tablas de contenido
(no existen aún; la prueba pgTAP verifica que las funciones `admin_*` solo leen tablas permitidas).

**Razón**: FR-030…FR-033 y deja a 002 solo la verificación previa a la llamada (AC-07).

---

## R14. Design system: tokens, color y tipografía

**Decisión**:

- Fuente de verdad: `src/styles/tokens.css` con variables CSS semánticas (`--color-primary`,
  `--color-on-primary`, `--color-accent`, `--color-on-accent`, `--color-accent-strong`,
  `--color-success|warning|danger|info` y sus `on-*`, `--color-surface`, `--color-surface-raised`,
  `--color-surface-sunken`, `--color-border`, `--color-border-strong`, `--color-text`,
  `--color-text-muted`, `--color-focus-ring`) definidas en **hex sRGB** para `:root` (claro) y
  `.dark` (oscuro), expuestas a Tailwind v4 con `@theme inline`. Se elimina la paleta por defecto de
  Tailwind (`--color-*: initial`), por lo que una clase como `bg-red-500` no existe. Escalas de
  tipografía (fluida con `clamp`), espaciado (base 4 px), radios, elevación (sombras por tema) y
  motion (duraciones y curvas; 0 ms bajo `prefers-reduced-motion`).
- Hallazgo de contraste: tinta `#0E5A4A` sobre papel `#F3F5F1` ≈ 7,4:1 (AA y AAA), pero ají
  `#E89A0C` sobre papel ≈ 2,1:1 (no sirve para texto ni bordes). Por eso el acento se usa como
  **relleno** con texto `on-accent` oscuro (≈ 7:1) y existe `accent-strong` (ají oscurecido, objetivo
  ≥ 4,5:1 sobre superficies claras) para texto e iconos de acento. En oscuro: superficie verde-negra
  profunda, primario verde aclarado y ají casi sin cambios (alto contraste sobre fondo oscuro). Los
  valores finales los fija la prueba de contraste.
- Verificación (SC-009): prueba Vitest que lee `tokens.css`, recorre una lista declarada de pares
  (texto/fondo, componente/fondo) por tema y exige 4,5:1 o 3:1 según el par; regla ESLint
  (`no-restricted-syntax`) que, fuera de `src/styles/`, falla con literales hex/rgb/hsl/oklch, con
  cualquier valor arbitrario de Tailwind `*-[…]` (colores, tamaños como `text-[13px]` o `w-[…]`,
  sombras) y con props `style` que contengan valores literales (solo se permite `var(--…)`). Las
  excepciones requieren `eslint-disable` con justificación. Una prueba Vitest con la API de ESLint
  (`tests/unit/lint/no-literal-styles.test.ts`) verifica la regla sobre fixtures válidos e inválidos.
- Fuentes: `next/font/google` con Bricolage Grotesque (títulos) y Figtree (texto), variables,
  subconjunto `latin` (incluye tildes y ñ), `display: swap` y `adjustFontFallback` para CLS < 0,1.
- Avatar: color de fondo elegido de forma determinista (hash del `user_id`) entre 6 pares de tokens
  `avatar-n`/`on-avatar-n` verificados AA; iniciales con `Intl.Segmenter` (grafemas: soporta emojis y
  tildes), máximo 2, con respaldo "?" nunca vacío.

**Alternativas consideradas**: tokens en OKLCH (mejor para generar escalas, pero complica la prueba
de contraste determinista sin dependencia extra); Style Dictionary (innecesario con una sola
plataforma).

---

## R15. Componentes base

**Decisión**: componentes de shadcn/ui copiados a `src/components/ui/` y reescritos con tokens:
button (variantes primary, secondary, accent, ghost, destructive, link; tamaños sm, md, lg, icon;
`loading` con `aria-busy`), input, textarea autoajustable (CSS `field-sizing: content` con respaldo
JS), select, checkbox, radio-group, switch, badge, card, table responsive (tabla en ≥ 640 px; lista
de tarjetas `<dl>` en móvil, sin scroll horizontal de página), tabs, dialog, sheet (Radix) +
bottom-sheet móvil (vaul), toast (sonner, `aria-live`), tooltip, skeleton, empty-state, progress,
gauge y score-ring (SVG propio con `role="meter"`/`aria-valuenow`, animado con Motion respetando
`MotionConfig reducedMotion="user"`), avatar y dropdown-menu. `/design` los muestra en vivo en claro
y oscuro (dos paneles con `data-theme` forzado) con estados normal, foco, deshabilitado, error y
carga.

**Razón**: Radix aporta accesibilidad (teclado, roles, foco, Escape) probada; la personalización por
tokens cumple el Principio IV.

---

## R16. Tema sin parpadeo (FR-038)

**Decisión**: `next-themes` con `attribute="class"`, `defaultTheme="system"`, `enableSystem`,
`disableTransitionOnChange`; preferencia en `localStorage` (por dispositivo, como pide la spec); el
script inline que inyecta lleva el nonce de la CSP (R19). `<html suppressHydrationWarning>`.

---

## R17. Formularios, errores y estados

**Decisión**: formularios nativos con Server Actions + `useActionState`; esquemas Zod compartidos
(`src/features/*/schemas.ts`) para validar en servidor (autoritativo) y mostrar errores en cliente.
Tipo de respuesta único:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]>;
      retryAfterSeconds?: number; values?: Record<string, string> };
```

`ErrorCode` es un catálogo cerrado (`validation`, `unauthorized`, `forbidden`, `not_found`,
`conflict`, `rate_limited`, `invitation_invalid`, `suspended`, `unexpected`); los mensajes son
textos en español del catálogo, nunca el error original. Los errores inesperados se envían a Sentry
con un id de correlación que sí se muestra al usuario. Se devuelven `values` (sin contraseñas) para no
perder lo escrito. Cada pantalla implementa `loading.tsx` (skeleton), `error.tsx` (reintentar),
estado vacío y "sin permiso" (componente `Forbidden` que no revela existencia del recurso).

---

## R18. Formato y zonas horarias

**Decisión**: `Intl.DateTimeFormat('es-PE', { timeZone })` y `Intl.NumberFormat('es-PE')` en
`src/lib/format.ts`. Lista de zonas ofrecida en la UI: `Intl.supportedValuesOf('timeZone')` (siempre incluye el valor
actual); Zod solo valida el formato y la BD es la autoridad (`private.is_valid_timezone` contra
`pg_timezone_names`, `22023` → error en el campo). Zona por defecto `America/Lima`. La UI usa la zona del perfil;
los agregados de consumo usan la de cada organización.

---

## R19. Encabezados de seguridad y CSP

**Decisión**: `proxy.ts` genera un nonce por petición y fija una CSP estricta
(`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`,
`frame-ancestors 'none'`, `connect-src` con Supabase y Sentry), más HSTS, `X-Content-Type-Options`,
`Referrer-Policy: strict-origin-when-cross-origin` (y `no-referrer` en `/invitacion/*` y
`/auth/confirm`) y `Permissions-Policy` restrictiva. Todas las rutas se renderizan dinámicamente
(requisito del nonce). Lighthouse CI verifica que la landing siga en Performance ≥ 90; si no, se
evaluará CSP por hashes para la landing.

**Alternativas consideradas**: CSP con `'unsafe-inline'` (no protege contra XSS).

---

## R20. Estrategia de pruebas y CI

**Decisión**:

- **Vitest**: Zod, política de contraseñas, iniciales, formato es-PE, `invitation_status`,
  cálculo de `retry_after`, contraste de tokens, render de correos (HTML y texto contienen enlace y
  plazo; sin tokens en logs).
- **pgTAP** (`supabase/tests/database/`): guardián de RLS y `organization_id` indexado; aislamiento
  A/B (leer/crear/modificar/eliminar en cada tabla de negocio con JWT simulado de cada usuario);
  `aal1` rechazado en todas las `admin_*`; superadmin `aal2` sin acceso a tablas de contenido;
  inmutabilidad de `audit_logs`; `accept_invitation` atómica e idempotente; validaciones de cuota;
  retención de solicitudes; política de sesión (`current_session_ok`); organización suspendida sin
  acceso.
- **Playwright + axe**: proyectos `mobile-360` (360×800) y `desktop` (1280×800) × temas claro y
  oscuro; flujos de las 10 historias, suite de aislamiento A/B, recorrido solo con teclado, cero
  violaciones `serious`/`critical`. Los datos sembrados son de solo lectura en e2e: toda prueba que
  muta estado (MFA, contraseña, suspensión, bloqueos, invitaciones, solicitudes) crea sus propios
  datos con factorías (`tests/e2e/fixtures/factories.ts`, correos `<prefijo>+<uuid>@ejemplo.test`) y
  cada prueba usa una IP propia (`uniqueClientIp()`), para que los 4 proyectos puedan ejecutarse en
  paralelo sin compartir estado ni contadores de rate limit. Las aserciones localizan la fila propia
  por su correo u organización únicos; los agregados globales (contador de solicitudes nuevas) y la
  bandeja de solicitudes, que no tiene búsqueda, se prueban en un proyecto `global` en serie que corre
  después de los paralelos (pruebas etiquetadas `@global`). Las factorías no crean `ai_usage`.
- **Pruebas con usuarios** (fuera de CI, en producción antes de abrir el acceso): SC-001, SC-002 y SC-011 se miden con personas y
  cronómetro según el protocolo de [quickstart.md](./quickstart.md#pruebas-con-usuarios-sc-001-sc-002-sc-011).
- **Lighthouse CI**: landing, `/iniciar-sesion` y `/inicio` (con sesión sembrada), perfil móvil,
  asserts Performance ≥ 0,9 y Accessibility = 1.
- **CI (GitHub Actions)**: `lint` → `typecheck` → `unit` → `db` (`supabase start`, `supabase db reset`,
  `supabase test db`) → `build` + `bundle-secrets` (busca la clave secreta, `SMTP_PASS`,
  `RATE_LIMIT_PEPPER` y patrones `sb_secret_` en `.next/static`) → `e2e` → `lighthouse`. Todos
  obligatorios en la protección de `main`.

---

## R21. Observabilidad

**Decisión**: Sentry (`@sentry/nextjs`) en servidor y cliente con `sendDefaultPii: false` y
`beforeSend`/`beforeBreadcrumb` que eliminan correos, cuerpos de formularios, cookies y segmentos de
URL de `/invitacion/*` y parámetros `token_hash`. Vercel Analytics + Speed Insights para Web Vitals.
Logs de servidor estructurados solo con ids y códigos.

---

## R22. Entornos, configuración y costos

**Decisión**: entornos `local` (`supabase start`, también en CI) y `production` (un único proyecto
Supabase; sin staging por decisión de negocio). Vercel despliega solo producción desde `main`:
`vercel.json` omite los builds de preview (`ignoreCommand`), porque no tendrían base de datos y
nunca deben apuntar a la de producción. La validación previa al merge es local + CI. Variables:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SUPPORT_EMAIL` (medio de contacto para usuarios suspendidos),
`SUPABASE_SECRET_KEY`, `SEND_EMAIL_HOOK_SECRET`, `SMTP_HOST|PORT|USER|PASS`, `EMAIL_FROM`,
`RATE_LIMIT_PEPPER`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` y, solo para pruebas, `E2E_EMAIL_FAIL_DOMAIN`
(dominio de destinatarios cuyo envío falla de forma simulada; `env.ts` la rechaza si `NODE_ENV` o
`VERCEL_ENV` es `production`). Configuración de Auth versionada en
`supabase/config.toml` (signup deshabilitado, MFA TOTP habilitado, longitud mínima 10,
`otp_expiry = 3600`, hook de correo, URLs de redirección, `max_frequency` y `email_sent`) y
replicada en producción por `supabase config push`, salvo los límites nativos por IP
(`sign_in_sign_ups`, `token_verifications`), que en producción se fijan estrictos en el
dashboard y en local/CI quedan holgados (R9).

**Alerta de costos (Principio VI, para decisión de negocio, no bloquea esta feature)**:

- El plan Hobby de Vercel es solo para uso no comercial; el lanzamiento comercial requiere Vercel Pro
  (≈ US$ 20/mes por miembro).
- El plan gratuito de Supabase pausa proyectos inactivos y no incluye backups; recomendable Supabase
  Pro (≈ US$ 25/mes) para producción. Con Pro se activan además time-box/inactividad nativos (R7) y la
  protección de contraseñas filtradas (R6) como capas adicionales.
- Resend gratuito: 3.000 correos/mes y 100/día; suficiente para esta etapa.
