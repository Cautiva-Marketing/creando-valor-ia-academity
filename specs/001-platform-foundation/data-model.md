# Data Model: Fundación de la plataforma Creando Valor IA™

**Feature**: `001-platform-foundation` | **Fecha**: 2026-11-23 | **Plan**: [plan.md](./plan.md)

Postgres de Supabase. Esquema `public` (expuesto por PostgREST) y `private` (no expuesto: helpers y
rate limiting). Identificadores en inglés; `uuid` con `gen_random_uuid()` salvo indicación; todas las
marcas de tiempo `timestamptz` en UTC. **RLS activo en todas las tablas de ambos esquemas.**

## Clasificación de tablas

| Tabla | Tipo | `organization_id` |
|---|---|---|
| `memberships`, `teams`, `quotas`, `ai_usage` | Negocio (por organización) | `NOT NULL` + FK + índice |
| `organizations` | Tenant raíz | es la propia organización |
| `profiles`, `platform_admins`, `legal_documents`, `legal_acceptances`, `invitations`, `access_requests` | Plataforma | no aplica |
| `audit_logs` | Plataforma/seguridad | nullable + índice (ver Complexity Tracking del plan) |
| `private.rate_limit_events` | Infraestructura privada | no aplica |

La prueba pgTAP guardiana mantiene esta lista: cualquier tabla nueva de `public` que no esté en la
lista de plataforma debe tener `organization_id NOT NULL` indexado y RLS, o la prueba falla.

## Tipos enumerados

```text
organization_type     = personal | empresa
organization_status   = active | suspended
org_role              = admin_empresa | supervisor | instructor | vendedor
membership_status     = invited | active | suspended
email_send_status     = pending | sent | failed
access_request_status = new | invited | discarded
legal_document_kind   = terms | ai_notice | privacy
onboarding_status     = pending | in_progress | completed | skipped
audit_actor_type      = user | system | operator
audit_result          = success | failure
ai_task               = tutor | buyer | evaluator | embedding
```

`superadmin` no es un `org_role`: es de plataforma (`platform_admins`).

---

## Entidades

### organizations

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| type | organization_type | NOT NULL |
| name | text | NOT NULL, 1–120; en orgs `personal`: `full_name` del único miembro, sincronizado por `update_my_profile` (el slug no cambia) |
| slug | text | NOT NULL, UNIQUE, `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 60; se genera solo en SQL con `private.slugify(text)` (`unaccent`, minúsculas, no alfanuméricos → `-`, base truncada a 55, respaldo `org` si queda vacía) + sufijo aleatorio de 4 caracteres (`-xxxx`) ante colisión |
| sector | text | NULL (lista cerrada se define en 002) |
| timezone | text | NOT NULL DEFAULT `'America/Lima'`; validada contra `pg_timezone_names`; en orgs `personal` se mantiene igual a `profiles.timezone` del único miembro (vía `update_my_profile`) |
| status | organization_status | NOT NULL DEFAULT `active` |
| suspended_reason | text | NULL, ≤ 500; si `status = suspended`, NOT NULL y no solo espacios (CHECK `status <> 'suspended' OR btrim(coalesce(suspended_reason, '')) <> ''`). Se conserva al reactivar (última suspensión); la UI solo lo muestra si `status = suspended` |
| suspended_at | timestamptz | NULL; se conserva al reactivar |
| suspended_by | uuid → auth.users | NULL; se conserva al reactivar |
| created_at, updated_at | timestamptz | `updated_at` por trigger |

Índices: `slug` (único), `(status)`, `(created_at)`.

### profiles

1:1 con `auth.users`; creado por trigger `on auth.users insert`.

| Columna | Tipo | Reglas |
|---|---|---|
| user_id | uuid PK → auth.users ON DELETE CASCADE | |
| email | text | NOT NULL, normalizado (`lower(trim())`), copiado de Auth |
| full_name | text | NULL hasta la activación; 1–80, no solo espacios (CHECK `btrim(full_name) <> ''`); una vez definido no puede volver a NULL (trigger) |
| timezone | text | NOT NULL DEFAULT `'America/Lima'`; CHECK `private.is_valid_timezone(timezone)`. La BD es la autoridad (`pg_timezone_names`); el cliente ofrece las opciones de `Intl.supportedValuesOf('timeZone')` y solo valida formato |
| onboarding_status | onboarding_status | NOT NULL DEFAULT `pending` |
| onboarding_step | smallint | NOT NULL DEFAULT 1, CHECK 1–3 |
| onboarding_updated_at | timestamptz | NULL; lo fija el trigger `before update of onboarding_status, onboarding_step` (= `now()` si alguno cambia) |
| created_at, updated_at | timestamptz | |

El usuario solo puede actualizar directamente `onboarding_status` y `onboarding_step` (GRANT de
columnas, y solo si `private.is_operative_user()` según la política RLS); `full_name` y `timezone` se cambian solo vía `public.update_my_profile` (T176); `email` lo
sincroniza el servidor.

### platform_admins

| Columna | Tipo | Reglas |
|---|---|---|
| user_id | uuid PK → auth.users | |
| created_at | timestamptz | |
| created_by_label | text | operador que ejecutó el script |

Sin escritura desde la app (solo scripts operativos con la clave secreta).

### memberships

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations ON DELETE RESTRICT | NOT NULL |
| user_id | uuid → auth.users | NOT NULL |
| roles | org_role[] | NOT NULL, `cardinality(roles) > 0`, sin duplicados |
| status | membership_status | NOT NULL DEFAULT `active` |
| invited_at | timestamptz | NULL |
| joined_at | timestamptz | NULL; NOT NULL si `status = active` |
| created_at, updated_at | timestamptz | |

Reglas: UNIQUE `(organization_id, user_id)`; índices `(organization_id)`, `(user_id)`. Trigger
de validación: en organizaciones `personal`, `roles = '{vendedor}'` y como máximo una pertenencia
(FR-002, clarificación 1).

### teams

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations | NOT NULL, índice |
| name | text | NOT NULL, 1–80, UNIQUE `(organization_id, name)` |
| manager_user_id | uuid → auth.users | NULL |
| created_at, updated_at | timestamptz | |

Sin interfaz ni escritura en esta etapa.

### quotas

| Columna | Tipo | Reglas |
|---|---|---|
| organization_id | uuid PK → organizations | NOT NULL (PK sirve de índice) |
| daily_limit | integer | NOT NULL DEFAULT 10, ≥ 0 |
| monthly_limit | integer | NOT NULL DEFAULT 100, ≥ 0 |
| updated_at | timestamptz | |
| updated_by | uuid → auth.users | NULL |

CHECK `daily_limit <= monthly_limit`. `0` = sin simulaciones permitidas.

### ai_usage

| Columna | Tipo | Reglas |
|---|---|---|
| id | bigint identity PK | |
| organization_id | uuid → organizations | NOT NULL |
| user_id | uuid → auth.users | NULL (procesos de sistema) |
| task | ai_task | NOT NULL |
| model | text | NOT NULL, ≤ 100 |
| simulation_id | uuid | NULL (FK la agrega 002) |
| input_tokens, output_tokens | integer | NOT NULL, ≥ 0 |
| latency_ms | integer | NOT NULL, ≥ 0 |
| estimated_cost_usd | numeric(12,6) | NOT NULL, ≥ 0 |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Índice `(organization_id, created_at)`. Sin contenido de mensajes. Inserción solo desde el servidor
(clave secreta) en 002.

### invitations

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| email | text | NOT NULL, normalizado (CHECK `email = lower(btrim(email))`), formato válido |
| target_organization_id | uuid → organizations | NULL = crear organización personal al aceptar (única opción en esta etapa) |
| roles | org_role[] | NOT NULL DEFAULT `'{vendedor}'` |
| invited_by | uuid → auth.users | NOT NULL |
| token_hash | bytea | NOT NULL, UNIQUE (SHA-256 del token; el token nunca se guarda) |
| expires_in_days | smallint | NOT NULL, 1–30, DEFAULT 7 |
| expires_at | timestamptz | NOT NULL |
| last_sent_at | timestamptz | NULL |
| send_status | email_send_status | NOT NULL DEFAULT `pending` |
| send_attempts | smallint | NOT NULL DEFAULT 0 |
| accepted_at | timestamptz | NULL |
| accepted_user_id | uuid → auth.users | NULL; NOT NULL si `accepted_at` |
| revoked_at | timestamptz | NULL |
| revoked_by | uuid → auth.users | NULL |
| access_request_id | uuid → access_requests | NULL, UNIQUE |
| idempotency_key | uuid | NULL, UNIQUE (clave por formulario; idempotencia de creación) |
| resend_idempotency_key | uuid | NULL, sin UNIQUE (clave del último reenvío aplicado; idempotencia de reenvío por diálogo de confirmación) |
| created_at, updated_at | timestamptz | |

Reglas: CHECK no aceptada y revocada a la vez. Índice único parcial `(email) WHERE accepted_at IS NULL
AND revoked_at IS NULL` (una invitación abierta por correo). Índices `(created_at)`, `(expires_at)`.

**Estado derivado** — `public.invitation_status(accepted_at, revoked_at, expires_at)` devuelve un
identificador en inglés (`pending | accepted | expired | revoked`), el mismo que acepta el filtro
`p_status` de `admin_list_invitations`; las etiquetas en español son solo de la UI:

```text
accepted_at IS NOT NULL      → accepted  (aceptada)
revoked_at  IS NOT NULL      → revoked   (revocada)
expires_at <= now()          → expired   (vencida)
otherwise                    → pending   (pendiente)
```

**Invitación abierta** = `pending` o `expired` (no aceptada ni revocada): es lo que bloquea crear otra
invitación para el mismo correo (índice único parcial, FR-010).

Transiciones:

```text
            create                 accept (válida al abrir y al confirmar)
   ∅ ───────────────▶ pendiente ───────────────────────────▶ aceptada (final)
                        │   ▲  │ revoke
               tiempo   │   │  └──────────────▶ revocada (final)
                        ▼   │ resend (token nuevo, plazo reiniciado)
                      vencida ──revoke──▶ revocada
```

Reenviar solo desde `pendiente` o `vencida`; revocar solo desde `pendiente` o `vencida`.

### access_requests

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| full_name | text | NULL solo si anonimizada; 1–80 |
| email | text | NULL solo si anonimizada; normalizado |
| company_or_role | text | NULL, ≤ 120 |
| message | text | NULL, ≤ 500 |
| privacy_document_id | uuid → legal_documents | NOT NULL; la versión de la política que se mostró al visitante, que debe ser la vigente al enviar (FR-048) |
| privacy_accepted_at | timestamptz | NOT NULL |
| status | access_request_status | NOT NULL DEFAULT `new` |
| invitation_id | uuid → invitations | NULL; NOT NULL si `status = invited` |
| reviewed_by | uuid → auth.users | NULL |
| reviewed_at | timestamptz | NULL |
| discarded_at | timestamptz | NULL; NOT NULL si `status = discarded` |
| discarded_by_system | boolean | NOT NULL DEFAULT false |
| anonymized_at | timestamptz | NULL |
| created_at, updated_at | timestamptz | |

Reglas: CHECK `anonymized_at IS NULL OR (full_name, email, company_or_role, message) IS NULL`
(todos nulos). Tras anonimizar solo quedan datos no personales (FR-049a): `status`, fechas,
`discarded_by_system`, `anonymized_at`, `privacy_document_id`, `invitation_id` y `reviewed_by` (id
del superadmin revisor, no del solicitante). Índice único parcial `(email) WHERE status = 'new' AND anonymized_at IS NULL`.
Índices `(status, created_at)`, `(discarded_at) WHERE status = 'discarded' AND anonymized_at IS NULL`.

Transiciones:

```text
 nueva ──convertir en invitación──▶ invitada (se conserva mientras exista la invitación/cuenta)
   │ ──descartar (superadmin)────▶ descartada ──90 días──▶ descartada + anonimizada (irreversible)
   └──180 días sin revisar (sistema)─▶ descartada
```

Una solicitud anonimizada no puede convertirse en invitación.

### legal_documents

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| kind | legal_document_kind | NOT NULL |
| version | text | NOT NULL (p. ej., `0.1-borrador`), UNIQUE `(kind, version)` |
| effective_at | timestamptz | NOT NULL |
| is_draft | boolean | NOT NULL |
| content_path | text | NOT NULL (`content/legal/...md`) |
| created_at | timestamptz | |

Vigente por tipo = mayor `effective_at <= now()`. Inmutable una vez publicado (trigger).

### legal_acceptances

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → auth.users | NOT NULL |
| document_id | uuid → legal_documents | NOT NULL |
| accepted_at | timestamptz | NOT NULL DEFAULT now() |

UNIQUE `(user_id, document_id)`. Se crean dentro de `accept_invitation` (términos y aviso de IA).

### audit_logs

| Columna | Tipo | Reglas |
|---|---|---|
| id | bigint identity PK | |
| occurred_at | timestamptz | NOT NULL DEFAULT now() |
| actor_type | audit_actor_type | NOT NULL |
| actor_user_id | uuid | NULL (sistema/operador) |
| actor_label | text | NULL (p. ej., operador del script) |
| organization_id | uuid → organizations | NULL |
| action | text | NOT NULL, del catálogo |
| object_type | text | NOT NULL |
| object_id | text | NULL |
| data | jsonb | NOT NULL DEFAULT `{}`; claves en lista blanca por acción |
| result | audit_result | NOT NULL DEFAULT `success` |

Índices `(organization_id, occurred_at)`, `(action, occurred_at)`, `(actor_user_id, occurred_at)`.
Trigger `BEFORE UPDATE OR DELETE` → excepción. Retención: 24 meses (research R11).

<a id="audit-actions"></a>
**Catálogo de acciones**

| action | object_type | data | actor |
|---|---|---|---|
| `invitation.created` | invitation | `{ email_domain, expires_in_days, access_request_id? }` | user |
| `invitation.resent` | invitation | `{ previous_expires_at, expires_at }` | user |
| `invitation.revoked` | invitation | `{ previous_status }` | user |
| `invitation.accepted` | invitation | `{ organization_id, user_id }` | user (el invitado) |
| `superadmin.login` | user | `{ step: 'mfa_verify' \| 'mfa_enroll' }` + `result` | user |
| `superadmin.mfa_enrolled` | user | `{}` | user |
| `superadmin.mfa_reset` | user | `{ sessions_revoked }` | operator |
| `quota.updated` | quota | `{ before: {daily, monthly}, after: {daily, monthly} }` | user |
| `organization.suspended` | organization | `{ reason }` | user |
| `organization.reactivated` | organization | `{ previous_reason }` | user |
| `access_request.converted` | access_request | `{ invitation_id }` | user |
| `access_request.discarded` | access_request | `{ automatic: bool }` | user / system |

Nunca se registran contraseñas, códigos TOTP, tokens ni enlaces; el correo de la invitación se
registra solo como dominio (el correo completo está en `invitations`).

### private.rate_limit_events

| Columna | Tipo | Reglas |
|---|---|---|
| id | bigint identity PK | |
| scope | text | NOT NULL (`login_account`, `login_ip`, `mfa_verify`, `recovery_email`, `activation_ip`, `access_request_ip`, `webhook_id`, `user_mutation`) |
| key_hash | bytea | NOT NULL (HMAC-SHA256 con pepper de servidor) |
| occurred_at | timestamptz | NOT NULL DEFAULT now() |

Índice `(scope, key_hash, occurred_at DESC)`. Purga diaria > 7 días. Sin acceso para `anon` ni
`authenticated`.

---

## Funciones helper de RLS (esquema `private`, `security definer`, `stable`, `search_path = ''`)

| Función | Devuelve | Lógica |
|---|---|---|
| `current_session_ok()` | boolean | Sesión del JWT (`session_id`) existe en `auth.sessions`; para superadmin `now() - created_at < 12 h`; para el resto `< 30 días` y `now() - coalesce(refreshed_at, created_at) < 7 días` |
| `is_superadmin()` | boolean | `current_session_ok()` ∧ `auth.uid()` ∈ `platform_admins` ∧ `auth.jwt()->>'aal' = 'aal2'` |
| `active_org_ids()` | setof uuid | Organizaciones `active` donde el usuario tiene pertenencia `active`, solo si `current_session_ok()` |
| `has_org_role(org uuid, role org_role)` | boolean | `org ∈ active_org_ids()` ∧ `role = any(roles)` |
| `is_operative_user()` | boolean | (`current_session_ok()` ∧ el usuario tiene una pertenencia `active` en una organización `active`) ∨ `is_superadmin()` |

## Políticas RLS (resumen)

| Tabla | SELECT | INSERT / UPDATE / DELETE desde cliente |
|---|---|---|
| organizations | `id in active_org_ids()` o `is_superadmin()` | ninguna (solo funciones) |
| profiles | propio (`user_id = auth.uid()` ∧ `current_session_ok()`) | UPDATE propio ∧ `is_operative_user()`, solo columnas permitidas |
| platform_admins | propio (para que la UI sepa si es superadmin) | ninguna |
| memberships | `user_id = auth.uid()` ∧ `organization_id in active_org_ids()`, o `is_superadmin()` | ninguna |
| teams | `organization_id in active_org_ids()` | ninguna |
| quotas | `organization_id in active_org_ids()` o `is_superadmin()` | ninguna (UPDATE vía `admin_update_quota`) |
| ai_usage | `organization_id in active_org_ids()` o `is_superadmin()` | ninguna (INSERT solo `service_role`) |
| invitations | `is_superadmin()` | ninguna (vía funciones `admin_*`) |
| access_requests | `is_superadmin()` | ninguna (INSERT `service_role`; cambios vía funciones) |
| legal_documents | todos (`anon`, `authenticated`) | ninguna |
| legal_acceptances | propias | ninguna (se crean en `accept_invitation`) |
| audit_logs | `is_superadmin()` (sin UI en esta etapa) | ninguna; trigger bloquea UPDATE/DELETE |
| private.rate_limit_events | ninguna | ninguna (`service_role` vía función) |

`anon` no tiene privilegios sobre ninguna tabla salvo `legal_documents` (SELECT).

## Operaciones atómicas clave

- **`accept_invitation`** (solo `service_role`): bloquea la invitación (`FOR UPDATE`), revalida
  `pendiente` y no vencida, exige que `p_user_id` tenga el mismo correo que la invitación y que sea
  una cuenta huérfana (sin pertenencias ni fila en `platform_admins`; si no, `P0011` `invalid`),
  exige que los documentos recibidos (`p_terms_doc`, `p_ai_notice_doc`, los que la persona vio) sean
  los vigentes de su tipo (si no, `P0011` `legal_outdated`, FR-015), actualiza `profiles.full_name`, crea `organizations` (personal, active,
  `America/Lima`, `name = full_name`, slug único con `private.slugify(full_name)` y sufijo ante
  colisión), `memberships` (`{vendedor}`, active, `invited_at`, `joined_at`),
  `quotas` (10/100), dos `legal_acceptances` con esos documentos (`ON CONFLICT DO NOTHING`), marca
  `accepted_at`/`accepted_user_id`, marca la solicitud de origen si existe y escribe
  `invitation.accepted`. Todo o nada.
- **Cuenta huérfana**: usuario de Auth sin pertenencias, sin fila en `platform_admins` y sin invitación
  aceptada (resto de una activación interrumpida). No cuenta como "cuenta activa" en FR-010
  (`admin_create_invitation` no devuelve `account_exists` por ella) y `activateAccount` la reutiliza
  si su correo coincide con el de la invitación (spec, Edge Cases).
- **`admin_create_invitation` / `admin_resend_invitation` / `admin_revoke_invitation`**,
  **`admin_update_quota`**, **`admin_set_organization_status`**,
  **`admin_discard_access_request`**: verifican `is_superadmin()`, validan, mutan y auditan en la misma
  transacción. `admin_create_invitation` es idempotente por `invitations.idempotency_key`: si la clave
  ya existe (también en un doble envío concurrente, vía `ON CONFLICT (idempotency_key) DO NOTHING` y
  relectura) devuelve la misma invitación con `duplicate = true`, sin auditar ni cambiar nada.
  `admin_resend_invitation` es idempotente por `invitations.resend_idempotency_key` (clave por diálogo
  de confirmación): con `FOR UPDATE`, si la clave recibida es la del último reenvío aplicado devuelve
  `duplicate = true` sin cambiar `token_hash` ni `expires_at` y sin auditar; si no, reemplaza el token,
  reinicia el plazo, guarda la clave y audita `invitation.resent`. `admin_revoke_invitation` es
  idempotente por estado: una invitación ya revocada devuelve `duplicate = true` sin auditar. Firmas en [contracts/database-rpc.md](./contracts/database-rpc.md).
- **`update_my_profile`** (`authenticated`): exige sesión válida y pertenencia operativa (o
  superadmin), valida `profiles.full_name` y `profiles.timezone`, actualiza `profiles` y, si el usuario
  es el único miembro de una org `personal`, también `organizations.name` (= `full_name`) y
  `organizations.timezone` (el slug no cambia). Todo o nada.

## Seed de desarrollo (`supabase/seed.sql`, solo local/CI)

Documentos legales `0.1-borrador` (términos, aviso IA, privacidad); dos superadmins de prueba: uno
con factor TOTP de secreto conocido (e2e de administración) y otro sin factor (registro obligatorio de
US4); organizaciones personales A y B con un vendedor cada una (`onboarding_status = completed`),
cuotas por defecto y filas de `ai_usage` de ejemplo; organización personal C con su vendedor C
(`onboarding_status = pending`, para US8 y el destino `/onboarding`); organización personal D
`suspended` (con `suspended_reason`) y su vendedor D (acceso suspendido); organización personal E
`active` con su vendedor E y pertenencia `suspended` (FR-024, pertenencia suspendida); solicitudes de acceso en los
tres estados; una invitación en cada estado. Todas las credenciales, el secreto TOTP y los tokens se
documentan en `tests/e2e/fixtures/seed-data.ts`.
