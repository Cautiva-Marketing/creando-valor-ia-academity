# Contrato: funciones de base de datos

Todas: `language plpgsql` o `sql`, `security definer` (salvo indicación), `set search_path = ''`,
nombres de tabla totalmente calificados. `REVOKE ALL ... FROM public` y `GRANT EXECUTE` explícito.
Errores con `RAISE EXCEPTION USING ERRCODE` del catálogo abajo; el servidor los traduce a
`ErrorCode` sin propagar el texto original.

| ERRCODE | Significado | ErrorCode TS |
|---|---|---|
| `42501` | no autorizado (sin `aal2`, sin pertenencia) | `forbidden` |
| `P0002` | no encontrado | `not_found` |
| `P0010` | conflicto de estado (p. ej., ya revocada) | `conflict` |
| `P0011` | invitación inválida (`DETAIL`: expired/revoked/used/invalid) | `invitation_invalid` |
| `P0012` | correo con cuenta activa o invitación abierta | `conflict` |
| `23514` | violación de CHECK (validación) | `validation` |
| `22023` | valor inválido (p. ej., zona horaria) | `validation` |
| `23505` | violación de unicidad no capturada por la función (p. ej., carrera en un índice único) | `conflict` |

## Expuestas a `authenticated`

| Función | Devuelve | Notas |
|---|---|---|
| `get_request_context()` | `jsonb { user_id, email, full_name, timezone, session_ok, aal, is_superadmin_account, has_verified_factor, onboarding_status, onboarding_step, memberships: [{ organization_id, type, status, roles, org_status }] }` | `security definer` (lee `auth.sessions`, `auth.mfa_factors` y `platform_admins`), solo datos de `auth.uid()`; una sola llamada por petición |
| `invitation_status(accepted_at, revoked_at, expires_at)` | `text` | `stable`, `security invoker` |
| `update_my_profile(p_full_name text, p_timezone text)` | `void` | exige `current_session_ok()` y pertenencia operativa o `is_superadmin()` (`42501`); valida nombre y zona (`private.is_valid_timezone`, `22023`); actualiza `profiles` y, si el usuario es el único miembro de una org `personal`, `organizations.name` (= `full_name`) y `organizations.timezone` (el slug no cambia) |
| `admin_list_invitations(p_status text, p_q text, p_limit int, p_offset int)` | `table(id, email, status, expires_at, last_sent_at, send_status, created_at, total_count)` | exige `is_superadmin()` |
| `admin_create_invitation(p_email text, p_days int, p_token_hash bytea, p_access_request_id uuid, p_idempotency_key uuid)` | `table(invitation_id uuid, duplicate boolean)` | idempotente por `p_idempotency_key`: si ya existe una invitación con esa clave la devuelve con `duplicate = true` sin auditar ni cambiar nada; el INSERT usa `ON CONFLICT (idempotency_key) DO NOTHING` y relee, de modo que un doble envío concurrente devuelve la misma fila; valida correo/plazo, unicidad (`P0012` con `DETAIL` `account_exists`/`open_invitation:<id>`), solicitud `new` y no anonimizada; audita `invitation.created` y, si aplica, marca la solicitud `invited` + `access_request.converted` |
| `admin_resend_invitation(p_id uuid, p_token_hash bytea)` | `timestamptz` (nuevo `expires_at`) | solo `pendiente`/`vencida`; reemplaza `token_hash`; audita `invitation.resent` |
| `admin_mark_invitation_sent(p_id uuid, p_ok boolean)` | `void` | actualiza `send_status`, `send_attempts`, `last_sent_at`; no audita |
| `admin_revoke_invitation(p_id uuid)` | `void` | solo `pendiente`/`vencida`; audita `invitation.revoked` |
| `admin_list_organizations(p_q text, p_limit int, p_offset int)` | `table(id, name, type, status, suspended_reason, created_at, daily_limit, monthly_limit, month_simulations, total_count)` | consumo del mes actual en la zona de cada organización |
| `admin_update_quota(p_org uuid, p_daily int, p_monthly int)` | `void` | CHECKs; audita `quota.updated` con antes/después; no-op si no cambia |
| `admin_set_organization_status(p_org uuid, p_status organization_status, p_reason text)` | `void` | motivo obligatorio (1–500) al suspender; audita `organization.suspended`/`reactivated` |
| `admin_discard_access_request(p_id uuid)` | `void` | solo `new`; audita `access_request.discarded` |
| `admin_usage_summary(p_from date, p_to date)` | `table(organization_id, organization_name, simulations bigint, input_tokens bigint, output_tokens bigint, estimated_cost_usd numeric)` | límites de día en la zona de cada organización; solo lee `organizations` y `ai_usage` |

## Solo `service_role` (servidor con clave secreta)

| Función | Devuelve | Notas |
|---|---|---|
| `accept_invitation(p_token_hash bytea, p_user_id uuid, p_full_name text, p_terms_doc uuid, p_ai_notice_doc uuid)` | `jsonb { organization_id, membership_id }` | atómica; `FOR UPDATE`; revalida estado y vencimiento (`P0011`); ver data-model |
| `write_audit(p_actor_type, p_actor_user_id, p_actor_label, p_org, p_action, p_object_type, p_object_id, p_data, p_result)` | `bigint` | valida `p_action` contra el catálogo y `p_data` contra su lista blanca de claves |
| `private.check_rate_limit(p_scope text, p_key bytea, p_max int, p_window interval, p_lockout interval)` | `table(allowed boolean, retry_after_seconds int)` | no registra evento |
| `private.record_rate_limit_event(p_scope text, p_key bytea)` | `void` | |
| `private.revoke_user_sessions(p_user uuid)` | `int` (sesiones eliminadas) | usado por el script de reset de MFA |
| `private.run_access_request_retention()` | `jsonb { discarded, anonymized }` | ejecutada por `pg_cron` diario (08:15 UTC) |
| `private.purge_rate_limit_events()` | `int` | `pg_cron` diario |

## Helpers RLS (`private`, no invocables por la API)

`current_session_ok()`, `is_superadmin()`, `active_org_ids()`, `has_org_role(uuid, org_role)` — ver
[data-model.md](../data-model.md) (sección "Funciones helper de RLS").

## Triggers

| Tabla | Trigger | Efecto |
|---|---|---|
| `auth.users` | `after insert` | crea `profiles` |
| `auth.users` | `after update of email` | sincroniza `profiles.email` |
| `audit_logs` | `before update or delete` | excepción (inmutable) |
| `legal_documents` | `before update or delete` | excepción si ya está vigente |
| `memberships` | `before insert or update` | en org `personal`: roles `{vendedor}` y máximo una pertenencia |
| `profiles` | `before update` | excepción si `full_name` pasa de no nulo a NULL |
| todas con `updated_at` | `before update` | `updated_at = now()` |
