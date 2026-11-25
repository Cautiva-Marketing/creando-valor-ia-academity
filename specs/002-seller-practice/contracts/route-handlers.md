# Contrato: Route Handlers (002)

Todas en runtime Node. Respuestas de error con el mismo catálogo de `ErrorCode` que las Server
Actions, en JSON `{ ok: false, code, message, retryAfterSeconds?, details? }`. Nunca se registra el
cuerpo de la petición ni el texto generado (FR-057); Sentry descarta cuerpos de `/api/practicas/*`.

## `POST /api/practicas/[id]/turnos` — turno del vendedor con respuesta en streaming

`export const maxDuration = 60`.

**Petición** (`application/json`, Zod `turnRequestSchema`):

```json
{ "clientMessageId": "uuid v4 generado por el navegador, reutilizado en cada reintento",
  "text": "1..1000 caracteres, no solo espacios (trim en servidor)" }
```

**Orden**: `getRequestContext()` (sin sesión → 401 `unauthorized`) → rate limit `practice_turn`
(20/min por usuario, 429) → Zod del cuerpo y de `[id]` (400 `validation`) → `authorizeOperative` (403
`suspended`/`forbidden`) → `begin_practice_turn(id, clientMessageId, text)` con el cliente del
usuario. Errores previos al streaming responden JSON con estado HTTP:

| Situación | HTTP | `code` |
|---|---|---|
| sesión ajena o inexistente | 404 | `not_found` |
| sesión no activa (finalizada, vencida por tiempo) | 409 | `conflict` + `details.status` |
| otro turno en curso | 409 | `conflict` + `details.reason = 'turn_in_progress'` |
| límite de 20 mensajes alcanzado | 409 | `conflict` + `details.reason = 'message_limit'` |
| organización suspendida | 403 | `suspended` |

Si `begin_practice_turn` indica que el `clientMessageId` **ya tiene respuesta**, el servidor no
llama a la IA: responde el stream con un único evento `turn` con la respuesta guardada (idempotencia,
SC-009).

**Respuesta**: `200`, `Content-Type: application/x-ndjson`, `Cache-Control: no-store`. Un objeto JSON
por línea:

| Evento | Campos | Significado |
|---|---|---|
| `ack` | `{ type, sellerMessage: { seq, id: "m7", content, createdAt } }` | mensaje del vendedor guardado (el navegador reemplaza el optimista) |
| `retrying` | `{ type, attempt: 2, waitMs }` | límite del proveedor; UI muestra "El cliente está tardando, reintentando…" |
| `delta` | `{ type, text }` | fragmento nuevo de la respuesta del cliente (texto provisional) |
| `reset` | `{ type }` | descartar el texto provisional (metadatos inválidos o guarda de rol; se regenera) |
| `turn` | `{ type, buyerMessage: { seq, id, content, createdAt }, state }` | turno confirmado; `content` es el definitivo |
| `ended` | `{ type, endReason, evaluationStatus }` | la sesión terminó en este turno (precede o sigue a `turn`) |
| `error` | `{ type, code: 'ai_unavailable'\|'unexpected', message, retryable: true, referenceId? }` | sin turno registrado; el mensaje del vendedor queda guardado sin respuesta → "Reintentar" |

`state` (público, nunca contiene secretos no revelados):

```json
{ "interest": 62, "mood": "interested", "lastDelta": 8,
  "sellerMessageCount": 7, "messagesLeft": 13, "deadlineAt": "ISO",
  "reveals": [{ "kind": "revealable", "key": "budget", "label": "Presupuesto",
                "value": "S/ 45 000 – S/ 50 000", "messageSeq": 12 }],
  "turnInProgress": false, "hintAvailable": true }
```

**Reglas**: reintentos del proveedor solo antes del primer `delta` (≤ 3 intentos en ≤ 30 s);
error a mitad del stream → `reset` + `error`; el tiempo de espera por errores se suma a
`provider_wait_ms`. La generación continúa aunque el navegador se desconecte. Si el turno termina la
sesión: `ended` + `after(runEvaluation)` cuando corresponde.

**Lector en el navegador** (`src/features/practice/stream/read-ndjson.ts`): `fetch` + `ReadableStream`
+ `TextDecoderStream`, tolerante a líneas partidas; errores de red → mensaje "no enviado" con
"Reintentar" (mismo `clientMessageId`). Un `401` (sesión de autenticación expirada) guarda el texto
como borrador local y redirige a `/iniciar-sesion?next=/practicas/<id>` (`safe-next` de 001); al
volver, la sesión activa se retoma con su borrador (edge case "Sesión expirada").

## `GET /api/practicas/[id]/estado` — estado para polling

**Orden**: `getRequestContext()` (sin sesión → `401`) → rate limit `practice_status` (60/min por
usuario; excedido → `429` con `Retry-After` y `{ code: "rate_limited" }`) → Zod del `id` (`400`) →
lectura con el cliente del usuario (RLS). Respuesta `200` JSON:
`{ status, evaluationStatus, evaluationPhase, manualRetriesLeft, endReason }`; `404` si no es del
usuario. `Cache-Control: no-store`. La pantalla de progreso consulta cada 2 s mientras la pestaña es
visible (30/min; el tope de 60/min admite dos pestañas) y hace `router.refresh()` cuando `status =
evaluated` o `evaluationStatus ∈ {failed, unavailable}`; ante un `429` espera `Retry-After` antes de
volver a consultar, sin mostrar error.

## `POST /api/internal/practice/evaluations` — despachador interno

Llamado solo por `pg_net` desde `private.run_practice_maintenance()`.

- Autenticación: `Authorization: Bearer <PRACTICE_DISPATCH_SECRET>` comparado en tiempo constante;
  si no coincide → `401` sin cuerpo. Sin cookies ni sesión de usuario.
- Cuerpo (Zod): `{ "sessionIds": uuid[1..5] }`.
- Respuesta inmediata `202`; en `after()` ejecuta `runEvaluation(id)` para cada id (secuencial, para
  no exceder el límite por minuto del proveedor). `runEvaluation` toma la evaluación con
  `claim_practice_evaluation` (si otra ejecución ya la tomó, no hace nada).
- Replay: una petición repetida o reenviada es inocua. El cuerpo solo lleva ids y `claim` solo toma
  evaluaciones `pending`, así que una evaluación ya tomada, guardada, fallida o no disponible no se
  vuelve a ejecutar ni consume IA (Principio II; plan.md → Constitution Check).
- `export const maxDuration = 300`.
