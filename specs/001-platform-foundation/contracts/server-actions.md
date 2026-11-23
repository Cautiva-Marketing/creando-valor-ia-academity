# Contrato: Server Actions

Convenciones comunes:

- Toda acción valida la entrada con Zod en el servidor (esquemas en `src/features/*/schemas.ts`) y
  devuelve `ActionResult<T>` (ver [research.md §R17](../research.md#r17-formularios-errores-y-estados)).
- Orden fijo: **rate limit (ámbito propio o, en acciones autenticadas, `user_mutation`) → Zod → guard → operación → auditoría (en la misma transacción
  cuando es SQL) → `revalidatePath`/`redirect`**.
- Los correos se normalizan con `email.trim().toLowerCase()` antes de cualquier comparación.
- Los mensajes de error provienen de un catálogo en español; nunca exponen errores internos.
- `values` devuelto en errores nunca incluye contraseñas ni códigos.

## Autenticación y cuenta

### `signIn(formData)`
- Entrada: `{ email: email, password: string(1..200), next?: internalPath }`.
- Rate limit: `login_account` (5 fallos/15 min, bloqueo 15 min) y `login_ip` (20/15 min). Se consultan
  antes de llamar a Auth; solo los fallos registran evento.
- Operación: `signInWithPassword`. Tras éxito: verifica pertenencias/superadmin y redirige según
  [routes.md](./routes.md#destino-tras-iniciar-sesión).
- Errores: `validation`, `rate_limited` (con `retryAfterSeconds`), `unauthorized` (mensaje genérico
  "Correo o contraseña incorrectos"), `suspended`.

### `signOut()`
- Guard: sesión. `signOut({ scope: 'local' })` → `/iniciar-sesion`.

### `requestPasswordReset(formData)`
- Entrada: `{ email }`. Rate limit `recovery_email` (3/h): la action solo **consulta** el límite y no registra eventos; el evento lo registra únicamente el Send Email Hook al enviar (contracts/emails.md, paso 4), de modo que cada solicitud cuenta una sola vez.
- Operación: `resetPasswordForEmail(email, { redirectTo: SITE_URL/auth/confirm })` solo si no se
  excede el límite. Respuesta **siempre** `ok: true` con la misma confirmación.

### `resetPassword(formData)`
- Guard: sesión de recuperación válida (`aal1` obtenida por `verifyOtp` de tipo recovery).
- Entrada: `{ password }` con política FR-014 (incl. distinta del correo y HIBP).
- Operación: `updateUser({ password })` → `signOut({ scope: 'others' })` (FR-021) → redirige al destino.

### `activateAccount(formData)`
- Entrada: `{ token: string(43), fullName: string(1..80, no solo espacios), password, acceptTerms:
  literal(true), acceptAiNotice: literal(true) }`.
- Rate limit: `activation_ip` (10/h).
- Guard: ninguno (pública), pero valida la invitación por `sha256(token)` en servidor: debe estar
  `pendiente` y no vencida (FR-011).
- Operación (research R4): `auth.admin.createUser` → `rpc accept_invitation` → compensación si falla →
  `signInWithPassword` → `redirect('/onboarding')`.
- Errores: `validation`, `rate_limited`, `invitation_invalid` (con `reason: expired | revoked |
  used | invalid`), `conflict` (correo ya registrado → ofrecer iniciar sesión).
- Idempotencia: un segundo envío concurrente no crea cuenta, organización ni auditoría adicional.

### `enrollMfa()` / `confirmMfaEnrollment(formData)`
- Guard: superadmin `aal1` sin factor verificado.
- `enrollMfa`: `mfa.enroll({ factorType: 'totp', issuer: 'Creando Valor IA' })` → `{ factorId, qrSvg,
  secret }` (el secreto se muestra solo en pantalla; nunca se registra).
- `confirmMfaEnrollment`: `{ factorId, code: /^\d{6}$/ }` → `challengeAndVerify` → audita
  `superadmin.mfa_enrolled` y `superadmin.login` (success) → `/admin/invitaciones`.

### `verifyMfa(formData)`
- Guard: superadmin `aal1` con factor. Entrada `{ code: /^\d{6}$/, next? }`.
- Rate limit `mfa_verify` (5 fallos/15 min → 15 min).
- Audita `superadmin.login` con `result = success | failure` en cada intento.

## Perfil y onboarding (vendedor)

### `updateProfile(formData)`
- Guard: `requireOperativeUser()` (pertenencia operativa o superadmin `aal2`). Entrada `{ fullName: 1..80, timezone: string 1..64 con formato `^[A-Za-z0-9_+\-/]+$` }` (solo formato; la BD valida contra `pg_timezone_names` y responde `22023`).
- Operación: `rpc update_my_profile(fullName, timezone)` con cliente de usuario; actualiza `profiles` y, en org `personal`, `organizations.name` y `organizations.timezone`. `22023` → error de validación en el campo de zona.

### `setOnboardingStep({ step: 1|2|3 })`, `skipOnboarding()`, `completeOnboarding()`, `resumeOnboarding()`
- Guard: `requireOrgMember(personalOrg, ['vendedor'])`.
- Persisten `onboarding_step` / `onboarding_status`. `completeOnboarding` redirige a `/perfil` (primer
  paso sugerido) o `/inicio`.

## Administración (todas: guard `requireSuperadmin()` = `aal2`; la función SQL vuelve a verificar)

### `createInvitation(formData)`
- Entrada: `{ email, expiresInDays: int 1..30 = 7, accessRequestId?: uuid, idempotencyKey: uuid }`.
  `idempotencyKey` es un campo oculto generado con `crypto.randomUUID()` por el Server Component que
  renderiza el formulario (una clave por formulario mostrado).
- Operación: genera token (32 bytes) → `rpc admin_create_invitation(email, days, token_hash,
  access_request_id, idempotency_key)` → si `duplicate = true`, no envía correo y devuelve la misma
  confirmación → si no, envía correo → `rpc admin_mark_invitation_sent(id, ok)`.
- Errores: `conflict` con `existing: { invitationId, status }` si hay cuenta activa
  (`reason: account_exists`) o invitación abierta (`reason: open_invitation`, con acción "Reenviar").
- Resultado: `{ invitationId, sendStatus, duplicate?: true }`; un doble envío devuelve la misma
  confirmación (nunca `conflict`). Si el envío falla, la invitación queda creada con aviso.
- Auditoría: `invitation.created` (+ `access_request.converted` si viene de una solicitud).

### `resendInvitation({ invitationId })`
- Válida desde `pendiente` o `vencida`. Token nuevo, plazo reiniciado (mismo `expires_in_days`),
  envío y marca de resultado. También es la acción "Reintentar envío". Auditoría `invitation.resent`.

### `revokeInvitation({ invitationId })`
- Válida desde `pendiente` o `vencida`. Auditoría `invitation.revoked`.

### `updateQuota(formData)`
- Entrada: `{ organizationId, dailyLimit: int ≥ 0, monthlyLimit: int ≥ 0 }` + refinamiento
  `daily ≤ monthly` (error en el campo diario).
- Auditoría `quota.updated` con antes/después. Sin cambios si los valores son iguales (no audita).

### `suspendOrganization(formData)` / `reactivateOrganization({ organizationId })`
- Suspender: `{ organizationId, reason: string(1..500) }`. Auditoría `organization.suspended`.
- Reactivar: auditoría `organization.reactivated`.
- Errores: `conflict` si ya está en el estado destino.

### `discardAccessRequest({ accessRequestId })`
- Solo desde `nueva`. Auditoría `access_request.discarded` (`automatic: false`).

## Públicas

### `submitAccessRequest(formData)`
- Entrada: `{ fullName: 1..80, email, companyOrRole?: ≤120, message?: ≤500, acceptPrivacy:
  literal(true), website: literal('') /* honeypot */, startedAt: signedTimestamp }`.
- Anti-abuso: honeypot vacío, `now - startedAt ≥ 3 s` (firma HMAC válida), rate limit
  `access_request_ip` (3/h).
- Operación: INSERT con cliente administrativo; si existe una `nueva` para el correo, no duplica.
- Respuesta: misma confirmación en éxito y en duplicado; `rate_limited` y `validation` como errores.

## Lecturas (Server Components, `queries.ts`, `server-only`)

| Query | Guard | Fuente |
|---|---|---|
| `getRequestContext()` | — | `rpc get_request_context` (cacheado por petición) |
| `getInvitationForToken(token)` | — | cliente administrativo, por `token_hash`; devuelve solo `{ email, status, expiresAt }` |
| `listInvitations({ status?, q?, page })` | S2 | `rpc admin_list_invitations` |
| `listAccessRequests({ status?, page })`, `countNewAccessRequests()` | S2 | RLS sobre `access_requests` |
| `listOrganizations({ q?, page })` | S2 | `rpc admin_list_organizations` |
| `getUsageSummary({ from, to })` | S2 | `rpc admin_usage_summary` |
| `getProfile()` | usuario | RLS sobre `profiles` + `legal_acceptances` |
