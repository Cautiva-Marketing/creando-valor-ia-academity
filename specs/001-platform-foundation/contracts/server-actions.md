# Contrato: Server Actions

Convenciones comunes:

- Toda acción valida la entrada con Zod en el servidor (esquemas en `src/features/*/schemas.ts`) y
  devuelve `ActionResult<T>` (ver [research.md §R17](../research.md#r17-formularios-errores-y-estados)).
- Orden fijo:
  - Acciones públicas o previas a la sesión (`signIn`, `requestPasswordReset`, `activateAccount`,
    `submitAccessRequest`): **rate limit del ámbito propio → Zod → operación → auditoría →
    `revalidatePath`/`redirect`**.
  - Acciones autenticadas: **autenticación (obtener `user_id`) → rate limit (ámbito propio o
    `user_mutation`, indexado por `user_id`) → Zod → autorización por rol/`aal` → operación →
    auditoría (en la misma transacción cuando es SQL) → `revalidatePath`/`redirect`**. Los guards de
    Server Actions de `src/lib/auth/guards.ts` encapsulan los dos primeros pasos.
  - Única excepción al rate limit: `signOut` (no muta datos de negocio y nunca debe impedir cerrar
    sesión).
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
- Guard: sesión. `signOut({ scope: 'local' })` → `/iniciar-sesion`. Sin rate limit (excepción
  explícita de las convenciones).

### `requestPasswordReset(formData)`
- Entrada: `{ email }`. Rate limit `recovery_email` (3/h): la action solo **consulta** el límite y no registra eventos; el evento lo registra únicamente el Send Email Hook al enviar (contracts/emails.md, paso 4), de modo que cada solicitud cuenta una sola vez.
- Operación: `resetPasswordForEmail(email, { redirectTo: SITE_URL/auth/confirm })` solo si no se
  excede el límite. Respuesta **siempre** `ok: true` con la misma confirmación.

### `resetPassword(formData)`
- Guard: variante de Server Action de `requireUser()` (T037) sobre la sesión de recuperación válida
  (`aal1` obtenida por `verifyOtp` de tipo recovery); aplica `user_mutation` por `user_id` antes de
  la operación.
- Entrada: `{ password }` con política FR-014 (incl. distinta del correo y HIBP).
- Operación: `updateUser({ password })` → `signOut({ scope: 'others' })` (FR-021) → redirige al destino.

### `activateAccount(formData)`
- Entrada: `{ token: string(43), fullName: string(1..80, no solo espacios), password, acceptTerms:
  literal(true), acceptAiNotice: literal(true), termsDocumentId: uuid, aiNoticeDocumentId: uuid }`.
  Los dos ids son los de las versiones que la página mostró (campos ocultos renderizados en el
  servidor con `getCurrentLegalDocuments()`).
- Rate limit: `activation_ip` (10/h).
- Guard: ninguno (pública), pero valida la invitación por `sha256(token)` en servidor: debe estar
  `pendiente` y no vencida (FR-011).
- Versiones legales (FR-015): antes de `createUser` comprueba que `termsDocumentId` y
  `aiNoticeDocumentId` sigan siendo los vigentes de su tipo; `accept_invitation` lo revalida en la
  transacción (`P0011` `legal_outdated`). Si alguno cambió → error `validation` con
  `fieldErrors.legal` ("Los términos o el aviso de uso de IA se actualizaron: revísalos y acéptalos
  de nuevo") y `values` con el nombre; la página vuelve a renderizar los documentos vigentes con las
  casillas desmarcadas.
- Operación (research R4): `auth.admin.createUser` → `rpc accept_invitation` → compensación si falla →
  `signInWithPassword` → `redirect('/onboarding')`.
- Recuperación de cuenta huérfana (spec, Edge Cases; data-model → "Cuenta huérfana"): si
  `createUser` falla porque el correo ya existe y esa cuenta es huérfana (sin pertenencias, no
  superadmin, sin invitación aceptada) con el mismo correo que la invitación, se reutiliza:
  `auth.admin.updateUserById(id, { password })` → `accept_invitation` con ese `user_id`. En la
  reutilización no se aplica la compensación (la cuenta ya existía). Si no es huérfana → `conflict`.
- Compensación: solo elimina el usuario creado en esta petición si sigue siendo huérfano (sin
  pertenencias), para no borrar una cuenta que una petición concurrente ya activó.
- Errores: `validation` (incluida la versión legal desactualizada), `rate_limited`,
  `invitation_invalid` (con `reason: expired | revoked | used | invalid`), `conflict` (correo con
  cuenta no huérfana → ofrecer iniciar sesión).
- Idempotencia: un segundo envío concurrente no crea cuenta, organización ni auditoría adicional
  (`FOR UPDATE` en `accept_invitation`; el segundo recibe `invitation_invalid` `used` o `conflict`).

### `enrollMfa()` / `confirmMfaEnrollment(formData)`
- Guard: variante de Server Action de `requireUser()` (T037), que aplica `user_mutation` por
  `user_id` antes de la operación, más la comprobación de superadmin `aal1` sin factor verificado.
- `enrollMfa`: `mfa.enroll({ factorType: 'totp', issuer: 'Creando Valor IA' })` → `{ factorId, qrSvg,
  secret }` (el secreto se muestra solo en pantalla; nunca se registra).
- `confirmMfaEnrollment`: `{ factorId, code: /^\d{6}$/ }`. Rate limit `mfa_verify` (5 fallos/15 min →
  15 min, compartido con `verifyMfa`) → `challengeAndVerify` → éxito: audita `superadmin.mfa_enrolled`
  y `superadmin.login` (`result = success`, `step: 'mfa_enroll'`) → `/admin/invitaciones`; código
  erróneo: registra evento `mfa_verify` y audita `superadmin.login` (`result = failure`,
  `step: 'mfa_enroll'`).

### `verifyMfa(formData)`
- Guard: superadmin `aal1` con factor. Entrada `{ code: /^\d{6}$/, next? }`.
- Rate limit `mfa_verify` (5 fallos/15 min → 15 min).
- Audita `superadmin.login` con `result = success | failure` y `step: 'mfa_verify'` en cada intento.

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

### `resendInvitation({ invitationId, idempotencyKey })`
- Entrada: `{ invitationId: uuid, idempotencyKey: uuid }`. `idempotencyKey` se genera con
  `crypto.randomUUID()` al abrir el diálogo de confirmación (una clave por diálogo; "Reintentar
  envío" también abre un diálogo nuevo con su propia clave).
- Operación: genera token → `rpc admin_resend_invitation(id, token_hash, idempotency_key)` → si
  `duplicate = true` (la misma clave ya se aplicó), no envía correo y devuelve la misma confirmación
  → si no, envío → `rpc admin_mark_invitation_sent(id, ok)`.
- Válida desde `pendiente` o `vencida`. Token nuevo, plazo reiniciado (mismo `expires_in_days`),
  envío y marca de resultado. También es la acción "Reintentar envío". Auditoría `invitation.resent`
  (una sola vez por clave).
- Resultado: `{ invitationId, sendStatus, duplicate?: true }`; un doble envío devuelve la misma
  confirmación (nunca `conflict`).

### `revokeInvitation({ invitationId })`
- Entrada: `{ invitationId: uuid }`. Válida desde `pendiente` o `vencida`. Auditoría
  `invitation.revoked`. Idempotente: revocar una invitación ya revocada devuelve la misma
  confirmación (`duplicate: true`) sin auditar; desde `aceptada` → `conflict`.

### `updateQuota(formData)`
- Entrada: `{ organizationId: uuid, dailyLimit: int ≥ 0, monthlyLimit: int ≥ 0 }` + refinamiento
  `daily ≤ monthly` (error en el campo diario).
- Auditoría `quota.updated` con antes/después. Sin cambios si los valores son iguales (no audita).

### `suspendOrganization(formData)` / `reactivateOrganization({ organizationId })`
- Suspender: `{ organizationId: uuid, reason: string().trim() 1..500 }` (un motivo con solo espacios
  se rechaza). Auditoría `organization.suspended`.
- Reactivar: auditoría `organization.reactivated`.
- Errores: `conflict` si ya está en el estado destino.

### `discardAccessRequest({ accessRequestId })`
- Entrada: `{ accessRequestId: uuid }`. Solo desde `nueva`. Auditoría `access_request.discarded` (`automatic: false`).

## Públicas

### `submitAccessRequest(formData)`
- Entrada: `{ fullName: 1..80, email, companyOrRole?: ≤120, message?: ≤500, acceptPrivacy:
  literal(true), privacyDocumentId: uuid, website: literal('') /* honeypot */, startedAt:
  signedTimestamp }`. `privacyDocumentId` es la versión de la política de privacidad que la página
  mostró (campo oculto renderizado en el servidor).
- Anti-abuso: honeypot vacío, `now - startedAt ≥ 3 s` (firma HMAC válida), rate limit
  `access_request_ip` (3/h).
- Versión legal (FR-048): si `privacyDocumentId` ya no es la política vigente → `validation` con
  `fieldErrors.acceptPrivacy` ("La política de privacidad se actualizó: revísala y acéptala de
  nuevo"), conservando lo escrito; la página muestra la versión vigente.
- Operación: INSERT con cliente administrativo (`privacy_document_id = privacyDocumentId`); si existe
  una `nueva` para el correo, no duplica.
- Respuesta: misma confirmación en éxito y en duplicado; `rate_limited` y `validation` como errores.

## Lecturas (Server Components, `queries.ts`, `server-only`)

| Query | Guard | Fuente |
|---|---|---|
| `getRequestContext()` | — | `rpc get_request_context` (cacheado por petición) |
| `getInvitationForToken(token)` | — (rate limit `activation_ip`: consulta antes de buscar; solo los tokens con formato válido pero inexistentes registran evento) | cliente administrativo, por `token_hash`; devuelve solo `{ email, status, expiresAt }` o `rate_limited` |
| `listInvitations({ status?, q?, page })` | S2 | `rpc admin_list_invitations` |
| `listAccessRequests({ status?, page })`, `countNewAccessRequests()` | S2 | RLS sobre `access_requests` |
| `listOrganizations({ q?, page })` | S2 | `rpc admin_list_organizations` |
| `getUsageSummary({ from, to })` | S2 | `rpc admin_usage_summary` |
| `getProfile()` | usuario | RLS sobre `profiles` + `legal_acceptances` |
