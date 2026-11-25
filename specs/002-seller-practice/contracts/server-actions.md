# Contrato: Server Actions (002)

Convenciones de [001/contracts/server-actions.md](../../001-platform-foundation/contracts/server-actions.md):
orden **autenticación → rate limit (`user_mutation` salvo ámbito propio) → Zod → autorización
(`authorizeOperative` + pertenencia `vendedor` en la organización personal) → operación (función SQL)
→ `revalidatePath`/`redirect`**, respuesta `ActionResult<T>`, mensajes del catálogo en español,
`values` para no perder lo escrito. Los ids de recurso llegan del formulario pero **nunca** se confía
en ellos: la función SQL verifica organización y dueño y responde `P0002` (→ `not_found`) si no
corresponden.

Nuevos `ErrorCode` (catálogo cerrado ampliado):

| Código | Uso | Mensaje base |
|---|---|---|
| `quota_exhausted` | cuota diaria/mensual agotada (FR-017) | "Alcanzaste tu límite de simulaciones. Se renueva el {fecha y hora}." (`details.renewsAt` ISO, `details.scope` `daily\|monthly\|disabled`) |
| `setup_limit` | 30 configuraciones o 30 fallos del día (FR-016) | "Alcanzaste el máximo de configuraciones de hoy. Podrás volver a configurar desde {hora}." |
| `active_session` | ya existe una sesión activa (FR-015) | "Tienes una práctica en curso." (`details.sessionId`) |
| `ai_unavailable` | el proveedor no respondió o la ficha no validó tras los reintentos | "No pudimos preparar a tu comprador. Inténtalo de nuevo." |

Mapeo SQL → TS (ampliación de 001): `P0020` → `quota_exhausted`, `P0021` → `setup_limit`, `P0022` →
`active_session`, `P0010` → `conflict`.

## Productos (`src/features/products/actions.ts`)

### `createProduct(formData)`
- Entrada (`productSchema`): `{ sector: enum, name: string(2..120, trim), description: string(0..1000),
  priceKind: 'fixed'|'range', priceMin: decimal ≥ 0 (2 decimales; acepta "1 250,50"), priceMax?:
  decimal ≥ priceMin (obligatorio si range), benefits: string(1..200)[1..10], differentiators:
  string(1..200)[0..10], verifiableFacts: string(1..200)[0..10], idempotencyKey: uuid }`.
- Operación: `create_product(org, payload, key)` → versión 1, activo. Idempotente por clave.
- Éxito: `redirect('/productos/[id]')`. Errores: `validation` (por campo), `suspended`, `unexpected`.

### `updateProduct(formData)`
- Entrada: `productSchema` sin `idempotencyKey` + `{ productId: uuid, expectedVersion: int ≥ 1 }`.
- Operación: `update_product(id, expectedVersion, payload)` → versión `expectedVersion + 1`. Si la
  versión vigente cambió (otra pestaña) → `conflict` con "Este producto cambió; recarga para ver la
  versión N". Si el contenido no cambia → no crea versión (`ok` con `unchanged: true`).

### `setProductStatus(formData)`
- Entrada: `{ productId: uuid, status: 'active'|'archived' }`. Auditoría `product.archived` /
  `product.reactivated` (ids). Idempotente por estado.

### `createObjection(formData)` / `updateObjection(formData)` / `deleteObjection(formData)`
- Entrada: `{ productId: uuid, text: string(5..300, trim), category?: enum }`; edición y borrado con
  `{ objectionId: uuid }`. El tope de 20 devuelve `conflict` con "Alcanzaste el máximo de 20
  objeciones para este producto". `deleteObjection` audita `objection.deleted` (ids). Producto
  archivado: se permite editar objeciones (no afectan prácticas nuevas hasta reactivar).

## Práctica (`src/features/practice/actions.ts`)

### `configurePractice(formData)`
- Entrada (`practiceSetupSchema`): `{ productId: uuid, objectionIds: uuid[1..3] (sin duplicados),
  difficulty: int 1..5, hintsEnabled: boolean, focusStage?: cautiva_stage, idempotencyKey: uuid }`.
- Orden: auth → `user_mutation` → Zod → autorización → `check_practice_setup(productId,
  objectionIds)` (SQL; cuota, topes, sesión activa, producto activo, objeciones del producto; **sin
  IA** si falla) → sorteo de la visible (`crypto.randomInt`) → IA `buyer_setup` (≤ 3 intentos,
  [ai-agents.md](./ai-agents.md#ficha-del-comprador)) → `create_configured_practice` (service role).
- Fallo de IA o ficha inválida tras reintentos → `record_practice_setup_failure` + `ai_unavailable`
  (no crea nada, no consume cuota).
- Éxito: `redirect('/practicas/[id]')` (pantalla previa).
- Errores: `validation`, `not_found`, `quota_exhausted`, `setup_limit`, `active_session`,
  `ai_unavailable`, `suspended`.

### `startPractice(formData)`
- Entrada: `{ sessionId: uuid }`. Operación: `start_practice_session(sessionId)` (SQL atómico:
  verifica dueño, `configured` no vencida, cuota con bloqueo, una activa; inserta consumición, `m1`
  desde el mensaje inicial, `deadline_at`). Idempotente: si ya está activa devuelve ok sin consumir.
- Éxito: `revalidatePath('/practicas/[id]')` (la vista pasa a chat). Errores: `quota_exhausted`,
  `active_session`, `conflict` (vencida/descartada), `not_found`.

### `finishPractice(formData)`
- Entrada: `{ sessionId: uuid }`. Precondición: sesión activa con ≥ 1 mensaje del vendedor y sin
  turno en curso (si hay uno, `conflict`: "Espera la respuesta del cliente"). Operación:
  `finish_practice_session` → `finalized` + `seller_ended` + `pending`; luego
  `after(() => runEvaluation(sessionId))`. Idempotente por estado.

### `requestHint(formData)`
- Entrada: `{ sessionId: uuid }`. Operación: `request_practice_hint` (máx. 1 por turno del vendedor;
  si ya pidió → `conflict` "Ya pediste una pista en este turno") → devuelve
  `{ hint: string, ideas: string[] }` calculadas con `selectHint`/`selectIdeas` a partir del estado
  público de la sesión (nunca de los secretos). Con pistas desactivadas → `forbidden`.

### `retryEvaluation(formData)`
- Entrada: `{ sessionId: uuid }`. Operación: `retry_practice_evaluation` (solo `failed` y
  `manual_retries < 3`) → `pending` + `after(runEvaluation)`. No consume cuota. Errores: `conflict`
  si no está `failed` o agotó los reintentos.

### `practiceAgain(formData)`
- Entrada: `{ sessionId: uuid, idempotencyKey: uuid }`. Lee la configuración de la sesión de origen
  (producto, `selected_objection_ids`, dificultad, pistas) y la etapa de `suggested_drill_stage` como
  foco; si el producto está archivado o alguna objeción ya no existe → `redirect('/practicar?producto=…&foco=…&aviso=configuracion-cambiada')`. Si no, sigue el
  mismo flujo de `configurePractice` (FR-048).
