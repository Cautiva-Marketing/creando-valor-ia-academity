# Research: Práctica del vendedor con cliente simulado por IA

**Feature**: `002-seller-practice` | **Fecha**: 2026-11-24 | **Plan**: [plan.md](./plan.md)

Cada sección sigue el formato *Decisión / Razón / Alternativas consideradas*. Se reutiliza todo lo
decidido en [001/research.md](../001-platform-foundation/research.md) (stack, guards, RLS, rate
limiting, `ActionResult`, tokens, pruebas, entornos); aquí solo se documenta lo nuevo. No quedan
"NEEDS CLARIFICATION" abiertos.

---

## R1. Dependencias nuevas

**Decisión**: solo dos dependencias de producción nuevas (Principio VI):

| Dependencia | Uso | Por qué / alternativa gratuita descartada | Costo |
|---|---|---|---|
| `ai` (Vercel AI SDK v6) | Adaptador de IA: `streamText`/`generateText` con salida estructurada (`Output.object` + Zod), utilidades de prueba (`ai/test`: `MockLanguageModelV3`) | Stack constitucional (Principio III) | 0 |
| `@ai-sdk/google` | Proveedor Gemini (capa gratuita) | Stack constitucional; el proveedor se elige por variable de entorno en un único módulo | 0 (capa gratuita; ver R16) |

Sin dependencias nuevas para gráficos (SVG propio, R13), streaming en cliente (lector NDJSON propio,
R5), colas (pg_cron + pg_net, R8) ni fechas (`Intl`). No se usa `@ai-sdk/react`/`useChat`: su
modelo (el cliente envía el historial) no encaja con un servidor que es la fuente de verdad del
historial, la idempotencia por mensaje y los eventos propios (termómetro, desbloqueos, reintentos).

**Alternativas consideradas**: AI Gateway de Vercel con cadenas `"google/gemini-…"` (unifica
proveedores y observabilidad, pero factura por uso y la constitución fija Gemini en capa gratuita;
queda como cambio de una línea en el adaptador); Recharts/visx para el gráfico (≈ 100 KB para una
sola línea de evolución); `@ai-sdk/react` (ver arriba).

---

## R2. Adaptador de IA y configuración de modelos

**Decisión**: `src/lib/ai/` (`server-only`) expone `getModel(task)` con `task ∈ buyer_setup | buyer |
evaluator`, y es el único lugar que importa `@ai-sdk/google`. Variables de entorno (servidor):

| Variable | Valor por defecto | Uso |
|---|---|---|
| `AI_PROVIDER` | `google` | `google` o `fake` (solo pruebas; `env.ts` lo rechaza en producción igual que `E2E_EMAIL_FAIL_DOMAIN`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Clave de Gemini; requerida si `AI_PROVIDER=google` |
| `AI_MODEL_BUYER_SETUP` | Flash vigente de la capa gratuita | Ficha del comprador + mensaje inicial + objeción oculta generada |
| `AI_MODEL_BUYER` | Flash/Flash-Lite vigente, razonamiento mínimo | Turnos del cliente (latencia, SC-007) |
| `AI_MODEL_EVALUATOR` | Flash vigente con razonamiento | Evaluación |

Los nombres exactos de modelo se fijan en `.env.example` al implementar, tras verificar su
disponibilidad en la capa gratuita (las familias cambian con frecuencia). Parámetros por tarea
(temperatura, `maxOutputTokens`, presupuesto de razonamiento vía `providerOptions.google`) viven en
`src/lib/ai/config.ts`, no en el dominio. `src/lib/ai/pricing.ts` guarda el precio de lista por
millón de tokens de cada modelo para `ai_usage.estimated_cost_usd` (se registra el costo de lista
aunque la capa gratuita no facture, para dimensionar el paso a pago).

Un proveedor **falso determinista** (`src/lib/ai/fake/`, implementado sobre `MockLanguageModelV3`)
responde guiones fijos y entiende marcadores de control en el mensaje del vendedor
(`[[e2e:429]]`, `[[e2e:cortar-stream]]`, `[[e2e:meta-invalida]]`, `[[e2e:revelar:budget]]`,
`[[e2e:cerrar]]`, `[[e2e:abandonar]]`, `[[e2e:eval-falla]]`) para que Playwright recorra todos los
caminos sin red ni costo.

**Razón**: Principio III (cambiar de proveedor no toca el dominio) y pruebas e2e deterministas.

**Alternativas consideradas**: interceptar HTTP de Gemini en e2e (frágil ante cambios del
protocolo de streaming); llamar al modelo real en CI (no determinista, consume cuota gratuita).

---

## R3. Prompts versionados y defensa contra inyección (FR-033, FR-035, AC-09)

**Decisión**:

- Tres prompts de sistema en `src/features/practice/ai/prompts/` (`buyer-setup.ts`, `buyer.ts`,
  `evaluator.ts`), cada uno con `PROMPT_ID` y `PROMPT_VERSION` semver (`buyer@1.0.0`). Un archivo
  `prompts.lock.json` guarda el SHA-256 del texto de cada versión; una prueba Vitest falla si el
  texto cambia sin subir la versión (inmutabilidad de versiones, Principio VII). Las sesiones
  guardan `buyer_setup_prompt_version` y `buyer_prompt_version`; las evaluaciones,
  `prompt_version` (FR-035, FR-044).
- Los datos no confiables (producto, objeciones, ficha, mensajes) nunca se concatenan al prompt de
  sistema como texto libre: van en bloques delimitados (`<datos_producto>…</datos_producto>`,
  `<ficha>…</ficha>`) serializados como JSON, con los delimitadores neutralizados dentro del
  contenido, y el prompt de sistema declara que todo lo que está dentro es información, nunca
  instrucciones. Los mensajes del vendedor viajan como mensajes de rol `user` separados.
- Límites de longitud de entrada antes de construir el prompt (producto ≤ FR-001, objeciones ≤ 300,
  mensaje ≤ 1.000, historial ≤ 41 mensajes por los límites de sesión); el prompt construido tiene un
  tope duro de caracteres verificado por prueba.
- Guardas de salida del cliente (`src/features/practice/ai/guards.ts`): (1) **fuera de rol**: si la
  respuesta menciona instrucciones, prompt, "modelo de lenguaje", "inteligencia artificial" o da
  consejos de venta explícitos, se regenera el turno (cuenta como metadato inválido, FR-034);
  (2) **coherencia de revelados**: si la respuesta contiene literalmente el valor de un dato
  revelable no declarado en los metadatos, el servidor lo registra como revelado para que el panel
  diga la verdad (y el dataset dorado verifica que esto no ocurre ante inyecciones).
- El prompt del cliente incluye el estado que necesita para actuar (interés actual, franja,
  mensajes restantes, si es su último turno, umbral de abandono y regla de los 3 primeros
  mensajes), para que su texto y sus metadatos sean coherentes con las reglas que aplica el
  servidor.

**Razón**: Principio III y AC-09; la versión en el lock hace verificable la trazabilidad de SC-004.

**Alternativas consideradas**: prompts en tabla de BD (edición sin despliegue, pero sin revisión de
código ni pruebas; fuera de alcance: no hay edición de prompts en esta feature); clasificador de
inyección con un segundo modelo (duplica costo y latencia; las guardas deterministas + dataset dorado
bastan en esta etapa).

---

## R4. Turno del cliente: un solo llamado con texto y metadatos (FR-024, FR-034)

**Decisión**: cada turno es **una** llamada `streamText` con salida estructurada
(`Output.object`) cuyo esquema pone primero `reply` (texto en personaje, ≤ 600 caracteres) y
después `meta` (`interest_delta`, `revealed[]`, `hidden_objection_raised`, `seller_abusive`, `end`,
`end_reason`). El servidor lee el flujo parcial (`partialOutputStream`), reenvía al navegador solo
los incrementos de `reply` y, al terminar, valida el objeto completo con Zod y con las reglas de
dominio (`validateTurnMeta`: acota ±15, descarta claves u objeciones inexistentes, ignora
`goal_achieved` si el interés resultante es < 80). Si `meta` no es interpretable o se dispara una
guarda de R3, se reintenta el turno hasta 2 veces (evento `reset` para que la UI descarte el texto
provisional); si persiste, se conserva el último texto con variación 0 y se registra el incidente
sin contenido (FR-034).

Abandono y último turno: si el interés resultante queda ≤ 10 (desde el 4.º mensaje, o por abuso) y
el modelo no marcó `end = buyer_abandoned`, se reintenta una vez con una nota de servidor que le
pide despedirse; si aun así no se despide, se añade al texto una frase de despedida del catálogo
fijo. El límite de mensajes se anuncia al modelo en el prompt ("este es tu último mensaje").

Spike obligatorio al iniciar la implementación: confirmar que el modelo elegido emite `reply` de
forma incremental con salida estructurada y que el primer fragmento llega < 2,5 s (SC-007). Si no,
plan B ya diseñado: `streamText` de texto plano con un separador final de una sola línea
(`\n§META§{json}`) que el servidor recorta antes de reenviar; el resto del flujo no cambia.

**Estado del spike (T003, ejecutado 2026-11-25 con la clave real, capa gratuita)**:

- **Modelos 2.5 cerrados**: `gemini-2.5-flash` y `gemini-2.5-flash-lite` responden 404 "no longer
  available to new users". Los vigentes son la familia 3.x.
- **`thinkingBudget: 0` ya no sirve**: `gemini-3.5-flash-lite` lo rechaza con 400. Gemini 3 usa
  `thinkingLevel` (`minimal` | `low` | `medium` | `high`). `gemini-3.8-flash` rechaza `minimal`.
  `src/lib/ai/config.ts` pasó a `thinkingLevel`: comprador `minimal`, ficha `low`, evaluador
  `medium`.
- **Plan A confirmado**: `streamText` + `Output.object` emite `reply` de forma incremental por
  `partialOutputStream` (2–3 incrementos por respuesta corta) con `gemini-3.5-flash-lite` y
  `gemini-3.5-flash`.
- **Primer fragmento**:
  - `gemini-3.5-flash`: 0,9–2,4 s en 11 muestras, p50 ≈ 1,8 s.
  - `gemini-3.5-flash-lite`: 1,7–8,9 s con la capa gratuita congestionada (503 frecuentes).

  El p95 de SC-007 no se puede certificar en la capa gratuita. Se mide en producción con
  `ai_usage.first_chunk_ms` (T198) tras pasar a la capa de pago.
- **Modelos elegidos**:
  - comprador `gemini-3.5-flash-lite` (el más barato que acepta `minimal`);
  - ficha y evaluador `gemini-3.6-flash` (sucesor estable al que Google redirige `3.5-flash`).

  `gemini-3.8-flash` cuesta lo mismo pero devolvió 503 en todas las pruebas.

**Razón**: un solo llamado mantiene la latencia del primer fragmento y el costo; el orden
`reply → meta` hace que los metadatos describan lo que el texto efectivamente hizo (revelados).

**Alternativas consideradas**: dos llamadas (texto en streaming + clasificador de metadatos) —
duplica costo y añade 1–3 s antes de actualizar el termómetro; metadatos primero — retrasa el
primer fragmento visible.

---

## R5. Transporte del streaming y procesamiento único (FR-023, FR-058, SC-009)

**Decisión**: Route Handler `POST /api/practicas/[id]/turnos` (runtime Node, `maxDuration = 60`)
que responde `application/x-ndjson` con eventos tipados (`ack`, `retrying`, `delta`, `reset`,
`turn`, `ended`, `error`; contrato en [contracts/route-handlers.md](./contracts/route-handlers.md)).
El navegador envía `{ clientMessageId: uuid, text }`; el `clientMessageId` se genera una vez por
mensaje y se reutiliza en cada "Reintentar".

Orden en servidor: sesión → rate limit `practice_turn` → Zod → `begin_practice_turn` (SQL, con
`FOR UPDATE` de la sesión): guarda el mensaje del vendedor **antes** de llamar a la IA, idempotente
por `(session_id, client_message_id)`; rechaza si hay otro turno en curso (lease de 90 s), si la
sesión no está activa o si venció el tiempo. Luego la IA con reintentos propios (no los de AI SDK,
`maxRetries: 0`): hasta 3 intentos en total (original + 2 reintentos) en ≤ 30 s con espera exponencial + jitter (1 s y 3 s), solo
ante 429/5xx/timeout y solo antes del primer fragmento; cada espera se notifica con `retrying` y se
suma a `provider_wait_ms` (no cuenta contra el límite de tiempo, FR-028d). Si el proveedor falla a
mitad del stream, se descarta el texto parcial (`reset` + `error`) y no se registra turno
(edge case). Al final, `commit_practice_turn` (SQL, solo `service_role`) aplica las reglas de estado
de forma atómica y libera el lease.

Si el navegador se desconecta, la generación **no** se cancela (no se pasa `request.signal` al
modelo): el turno se confirma y aparece al retomar. Si el proceso muere, el lease vence y el mensaje
del vendedor queda "sin respuesta" con "Reintentar" (reenvía el mismo `clientMessageId`).

**Verificación en la guía de Next 16.4 (T002)**: `after()` está disponible en Route Handlers y Server
Functions y corre hasta el `maxDuration` del segmento. Desde un Route Handler o una Server Function
se pueden leer `cookies()`/`headers()` dentro del callback, pero `runEvaluation` usa el cliente
administrativo y no los necesita. El runtime por defecto ya es Node y el runtime Edge está obsoleto,
así que **no** se exporta `runtime` (la guía pide quitarlo si se activan Cache Components). `params`
de los Route Handlers es una `Promise` (`RouteContext<'/api/…/[id]'>`). `maxDuration` se declara en el
`route.ts`; para las Server Actions se declara en la página. Respecto de lo asumido aquí no hay más
diferencias.

**Razón**: el servidor es la fuente de verdad; idempotencia y serialización en BD cubren doble
clic, varias pestañas y reintentos (SC-009).

**Alternativas consideradas**: SSE con `EventSource` (solo GET, sin cuerpo); WebSockets/Realtime
(infraestructura adicional); Server Action con streaming (no hay control fino de eventos ni de
desconexión).

---

## R6. Generación de la ficha del comprador (FR-011–FR-016)

**Decisión**: Server Action `configurePractice` con una sola llamada `generateText` +
`Output.object` que devuelve ficha (pública y oculta), datos revelables (`budget`, `timeline`,
`decision_maker`), meta, **mensaje inicial** del cliente (plantea la objeción visible) y, si se eligió
una sola objeción, la objeción oculta generada. Validación con Zod + reglas de dominio
(`validatePersona`: longitudes, edad 18–80, presupuesto en S/ entre el 70 % del mínimo y el 130 % del
máximo del precio, monto o rango con ambos extremos válidos). Hasta 3 intentos; si no valida o el
proveedor falla, se registra un intento fallido (tope propio de 30/día) y no se crea nada.

El sorteo de la objeción visible se hace en el servidor con `crypto.randomInt` **antes** de llamar
a la IA (la IA recibe cuál es visible y cuáles ocultas). Generar el mensaje inicial al configurar
hace que "Comenzar" sea instantáneo, no invoque a la IA y que la cuota solo se consuma en una
transacción de BD (FR-018).

Orden: guard → Zod → `check_practice_setup` (SQL: cuota de la organización FR-017, topes de
configuración FR-016, sesión activa FR-015; ninguna llamada a IA si falla) → sorteo → IA →
`create_configured_practice` (SQL, `service_role`: vuelve a comprobar la sesión activa, descarta la
configurada anterior, inserta sesión, ficha pública, secretos e intento exitoso, todo atómico).
Idempotencia por `setup_idempotency_key` (uuid por formulario).

**Razón**: cumple el control de costo antes de invocar la IA y deja la parte cara fuera del paso que
consume cuota.

**Alternativas consideradas**: generar el mensaje inicial al pulsar "Comenzar" (añade latencia y una
llamada que podría fallar después de consumir cuota).

---

## R7. Cuotas, consumo atómico y topes de configuración (FR-015–FR-018, AC-07, SC-012)

**Decisión**:

- Nueva tabla `simulation_consumptions` (una fila por sesión comenzada, PK `session_id`). El uso
  diario/mensual se cuenta sobre ella en la zona horaria de la organización
  (`(consumed_at at time zone o.timezone)::date`).
- `start_practice_session` (SQL) bloquea la fila de `quotas` de la organización (`FOR UPDATE`, que
  serializa inicios simultáneos de la misma organización), cuenta el uso, y si hay cupo inserta la
  consumición y pasa la sesión a `active` en la misma transacción. Idempotente por estado: si ya
  está activa devuelve la misma sesión sin consumir otra vez.
- Un índice único parcial `practice_sessions (user_id) WHERE status = 'active'` y otro
  `WHERE status = 'configured'` hacen imposible, a nivel de BD, tener dos sesiones activas o dos
  configuradas por usuario (FR-015), incluso desde dos dispositivos.
- Renovación (`private.practice_quota_status`): si se agotó solo la diaria → inicio del día local
  siguiente; si se agotó la mensual → inicio del mes local siguiente; si `daily_limit = 0` o
  `monthly_limit = 0` → sin fecha ("Tu organización no tiene simulaciones habilitadas").
- Topes de configuración: `practice_setup_attempts (outcome success|failure)`; 30 de cada tipo por
  usuario y día local de la organización; se comprueban en `check_practice_setup`.
- El panel del superadmin (`admin_usage_summary`, `admin_list_organizations.month_simulations`)
  pasa a contar `simulation_consumptions` en lugar de `count(distinct ai_usage.simulation_id)`,
  porque las fichas generadas de prácticas nunca comenzadas también registran uso de IA.
  `simulation_consumptions` no tiene contenido, así que no rompe FR-056.

**Razón**: la verificación y el consumo en una transacción con bloqueo garantizan SC-012 sin
infraestructura extra.

**Alternativas consideradas**: contar `practice_sessions.started_at` (mezcla el contenido con el
conteo de cuota y obligaría al superadmin a leer una tabla de contenido); contador en `quotas`
(requiere reinicios programados por zona horaria).

---

## R8. Trabajo en segundo plano: evaluación y cierres automáticos (FR-028d, FR-043, SC-002)

**Decisión**: tres mecanismos complementarios, sin servicios nuevos:

1. **Disparo inmediato**: al finalizar una sesión (botón, cierre logrado, abandono, límite de
   mensajes) el servidor llama `after(() => runEvaluation(sessionId))` (Next 16 `after`, que corre
   hasta el `maxDuration` de la ruta; 300 s con Fluid Compute).
2. **Mantenimiento cada minuto con `pg_cron`** (`private.run_practice_maintenance()`, SQL puro):
   cierra sesiones activas cuyo `deadline_at` venció (`time_limit`; evaluación `pending` o
   `not_applicable`; también en organizaciones suspendidas, porque el cierre no invoca a la IA), descarta configuradas vencidas (24 h), libera leases de turno vencidos, marca
   `failed` las evaluaciones cuyo `evaluation_due_at` (3 min) venció, y aplaza el plazo de las
   evaluaciones de organizaciones suspendidas (no se evalúan hasta reactivar).
3. **Despachador con `pg_net`**: la misma tarea envía `POST {app_url}/api/internal/practice/evaluations`
   con un secreto Bearer (URL y secreto en **Supabase Vault**) por las evaluaciones `pending`
   creadas hace más de 20 s (las que el disparo inmediato no tomó, p. ej. cierres por tiempo), en
   lotes de hasta 5. La ruta responde 202 y procesa en `after()`.

`runEvaluation` toma la evaluación con `claim_practice_evaluation` (SQL: `pending → in_progress`
con `FOR UPDATE SKIP LOCKED`), por lo que disparos duplicados son inocuos. Fases visibles
(`reading → scoring → reporting`) en `practice_sessions.evaluation_phase` para la pantalla de
progreso, que consulta `GET /api/practicas/[id]/estado` cada 2 s (con `visibilitychange`).

Presupuesto de tiempo: plazo total 3 min desde que la evaluación entra en `pending`; cada intento
con timeout de 50 s; hasta 3 intentos automáticos (1 + 2 reintentos de FR-040) con espera ante
429. Reintento manual (máx. 3 por sesión, FR-043) vuelve a `pending` con un nuevo plazo; al fallar
el 3.º pasa a `unavailable` (final).

Local: `pg_net` llega a la app con `host.docker.internal:3000` (igual que el Send Email Hook de
001); el valor se carga en Vault desde `supabase/seed.sql` (local) y con un script operativo en
producción (`scripts/ops/set-practice-dispatch.ts`), nunca en una migración.

**Razón**: cumple "sin depender de que el vendedor mantenga la página abierta" y "cerrada aunque
nadie la abra" con capacidades nativas de Supabase (Principio VI). `pg_net` y Vault son extensiones
incluidas en Supabase sin costo.

**Alternativas consideradas**: Vercel Cron (cada minuto requiere plan Pro); Vercel Queues (beta) o
Workflow DevKit (producto/dependencia nueva para un caso que cubre `pg_cron`); Supabase Edge
Functions (segundo runtime y despliegue para el evaluador, duplicaría el adaptador de IA); evaluar
solo al abrir la página (no cumple FR-043).

---

## R9. Evaluación: salida estructurada y validación en dos capas (FR-036–FR-045, AC-04)

**Decisión**:

- Entrada del evaluador (FR-038): transcripción con ids `m1…mN` y autor, ficha completa del
  escenario (comprador, objeciones visible/ocultas, meta, versión del producto con datos
  verificables) y la rúbrica versionada con criterios, pesos, etapas y anclas. Nada de otras
  sesiones ni del usuario (ni su nombre).
- Salida (`evaluationOutputSchema`, Zod): forma del Anexo A ampliada por FR-039
  (`confidence`, `status`, `ethical_flags[]`, `suggested_drill { text, stage }`). Las evidencias se
  piden como ids `mN`.
- `validateEvaluation(output, rubric, transcript)` (TS puro, probado con el dataset dorado): cada
  criterio una sola vez; `max_score = peso`; `0 ≤ score ≤ max` entero en evaluados; `score = null`
  en no evaluables; ≥ 1 evidencia por evaluado; evidencias y banderas solo con ids de mensajes del
  **vendedor** existentes; longitudes acotadas. El `total_score` propuesto se ignora: se recalcula
  (FR-041) con `computeTotal`.
- `save_practice_evaluation` (SQL, `service_role`) **vuelve a validar** pesos, rangos y que cada
  `mN` citado sea del vendedor en esa sesión, recalcula total y nivel en SQL e inserta evaluación,
  criterios y banderas de forma atómica; las tablas de evaluación son inmutables (trigger). La misma
  tabla de casos alimenta la prueba Vitest de `computeTotal` y la prueba pgTAP del cálculo SQL.

**Razón**: AC-04 se cumple aunque una capa falle; el total nunca depende del modelo.

**Alternativas consideradas**: confiar en el esquema JSON del proveedor (no garantiza reglas
cruzadas como ids existentes ni pesos).

---

## R10. Ocultamiento de la ficha (FR-014, FR-047)

**Decisión**: los datos ocultos viven en `practice_session_secrets` (motivación, personalidad,
valores revelables, objeciones ocultas, mensaje inicial). Su política RLS solo permite `SELECT` al
dueño cuando la sesión está `finalized` o `evaluated`. Lo descubierto durante la sesión se copia,
en el mismo `commit_practice_turn`, a `practice_session_reveals` (legible por el dueño), con el
`seq` del mensaje donde ocurrió. La ficha pública (nombre, edad, ocupación, presentación, meta) está
en `practice_buyer_profiles`.

**Razón**: el navegador tiene la sesión de Supabase (cookies legibles por JS de `@supabase/ssr`); si
los secretos estuvieran en una tabla legible, cualquiera podría leerlos con PostgREST. La RLS los
oculta de verdad, no solo en la UI.

**Alternativas consideradas**: columnas en `practice_sessions` con vista filtrada (las vistas no
heredan RLS por columna de forma simple; un `GRANT` por columna no depende del estado).

---

## R11. Pistas e ideas sin IA (FR-031)

**Decisión**: catálogo fijo en `src/features/practice/hints/catalog.ts` (textos en español, por
etapa C.A.U.T.I.V.A.™ y por situación: datos no descubiertos por clave, objeción oculta pendiente,
meta no alcanzada, pocos mensajes restantes, interés bajo). `selectHint(state)` y
`selectIdeas(state)` (2–3 chips) son funciones puras con prioridad determinista y rotación por
número de turno; nunca reciben valores ocultos (solo claves y banderas). El uso se registra con
`request_practice_hint` (máx. 1 por turno de vendedor, `practice_sessions.hints_used`).

**Razón**: cero costo de IA y garantía estructural de no revelar secretos.

---

## R12. Rutas y navegación (FR-051–FR-053)

**Decisión**: `/inicio` se mantiene como ruta de inicio (destino de 001 tras iniciar sesión y de
onboarding) y se rotula **"Hoy"**. Nuevas rutas: `/practicar` (configurar o ver la práctica en
curso), `/practicas/[id]` (una URL estable por sesión que muestra pantalla previa, chat, progreso de
evaluación o resultado según el estado; es el "enlace" para retomar), `/historial` (filtros en la
query: `producto`, `dificultad`, `desde`, `hasta`, `pagina`), `/productos`, `/productos/nuevo`,
`/productos/[id]`. Navegación del vendedor: Hoy, Practicar, Historial, Mis productos (barra
inferior de 4 en móvil); Perfil pasa al menú de cuenta. El paso de onboarding "primer paso sugerido"
apunta a `/productos/nuevo`.

**Razón**: no romper destinos de 001 y dar una URL de retome estable.

---

## R13. Gráfico de evolución y franja C.A.U.T.I.V.A.™ (FR-050, AC-12)

**Decisión**: componente propio `ScoreTrendChart` en SVG (línea + puntos, ejes 0–100, bandas de
nivel con tokens), con `<figure>`/`<figcaption>`, `role="img"` y resumen textual, y un botón
"Ver como tabla" que muestra una `<table>` con fecha, producto y puntaje. `CautivaStrip`: 7 celdas
con promedio por etapa, la más débil resaltada con borde + icono + texto ("Etapa a reforzar"), no
solo color. Promedios por etapa en SQL (`my_practice_stage_averages`), una sola fuente para Hoy e
Historial.

---

## R14. Accesibilidad del chat (FR-060, SC-010)

**Decisión**: el texto en streaming se pinta en un nodo con `aria-hidden="true"` mientras llega; al
recibir `turn`, el mensaje completo se inserta en la lista (`role="log"`) y se anuncia una sola vez
en una región `aria-live="polite"`. Cambios de interés y desbloqueos van a una segunda región
`polite` con texto breve ("Interés 62, Interesado, +8"; "Descubriste: Presupuesto"), con
antirrebote. El indicador "escribiendo…" es `role="status"`. El panel móvil usa el `BottomSheet`
(vaul) de 001; el resumen compacto (interés + ánimo) es un botón que lo abre. Citas del resultado:
enlaces a `#m7` que mueven el foco al mensaje (`tabindex="-1"`), lo resaltan con token y ofrecen
"Volver al criterio". Borrador no enviado en `localStorage` por sesión (`cvia:draft:<sessionId>`).

---

## R15. Estrategia de pruebas de esta feature (Principio V)

**Decisión**:

- **Vitest**: dominio puro (franjas de ánimo, nivel, `computeTotal`, promedios por etapa con
  criterio compartido, `validateTurnMeta`, `validatePersona`, `validateEvaluation`, sorteo, selección
  de pistas, renovación de cuota, formato `S/` es-PE, backoff con temporizadores falsos, parser
  NDJSON), construcción de prompts (delimitadores neutralizados, topes de longitud), lock de
  versiones de prompt, adaptador con `MockLanguageModelV3` (reintentos, `reset`, metadatos
  inválidos, desconexión).
- **pgTAP**: guardián (nuevas tablas con RLS y `organization_id` indexado), aislamiento A/B de cada
  tabla nueva (leer/crear/modificar/borrar), secretos ocultos hasta finalizar, inmutabilidad
  (`product_versions`, `rubrics`, `rubric_criteria`, `practice_evaluations` y derivadas),
  `commit_practice_turn` (acotado ±15, piso 11 en los 3 primeros salvo abuso, abandono ≤ 10, cierre
  solo ≥ 80, límite 20), `start_practice_session` (cuota, idempotencia, una activa), mantenimiento
  (tiempo, 24 h, 3 min, suspendidas), reintentos manuales (máx. 3 → `unavailable`),
  `save_practice_evaluation` (rechaza ids de cliente o inexistentes, puntajes > peso; recalcula
  total), superadmin sin acceso a contenido y conteo de simulaciones por consumiciones.
- **Playwright + axe** (proveedor falso, R2): un archivo por historia, suite de aislamiento A/B
  (URLs y peticiones directas → "no encontrado"), concurrencia (dos "Comenzar" en paralelo con
  cuota 1 → una sola consumición; dos pestañas enviando), recorrido solo con teclado a 360 px,
  ambos temas, cero violaciones serias/críticas.
- **Dataset dorado** (`tests/golden/`): ≥ 10 transcripciones (≥ 4 sectores, 5 dificultades, un
  solo mensaje, criterios sin evidencia, promesa sin sustento, presión indebida, ≥ 2 inyecciones en
  mensaje y en datos del producto) con salidas del evaluador grabadas. Dos modos:
  (a) **offline en CI** (bloqueante): valida las salidas grabadas con `validateEvaluation` y
  `computeTotal` y comprueba los casos de rechazo; (b) **en vivo** (`pnpm test:golden`, con clave
  real): ejecuta el evaluador y conversaciones guionadas de inyección contra el modelo y verifica
  SC-003/SC-006. Corre en el workflow `golden.yml` en cada PR que toque prompts, esquemas o el
  dataset (y semanalmente); el checklist del PR exige su resultado verde. No corre en todo PR porque
  consume la cuota gratuita (ver Complexity Tracking).
- **Medición**: SC-007/SC-008 con `latency_ms` y `ai_usage` (consulta de percentiles documentada
  en quickstart); SC-001/SC-013 con pruebas de usuarios (protocolo de 001).

---

## R16. Capacidad y costos de la capa gratuita de Gemini (Principio VI, alerta de negocio)

**Hallazgo**: la capa gratuita de Gemini tiene límites por minuto y por día **por proyecto** (no por
usuario), del orden de decenas de solicitudes por minuto y cientos a pocos miles por día según el
modelo, y Google puede usar los datos para mejorar sus productos. Una práctica completa usa ≈ 1
(ficha) + hasta 20 (turnos) + 1–3 (evaluación) llamadas: con algunos cientos de solicitudes diarias
caben solo **decenas de prácticas al día en toda la plataforma**.

**Decisión**: la feature funciona en capa gratuita para el piloto (datos ficticios, Principio II) y
se protege con: modelo ligero para turnos, reintentos con espera (R5), tope de 30 configuraciones
por usuario y día, despachador en lotes de 5 (R8) y registro de costo de lista en `ai_usage`. Antes
de abrir el acceso más allá del piloto se recomienda pasar a la capa de pago (cambio de clave, sin
cambio de código) y revisar las cuotas por organización; el panel de consumo de 001 da los datos
para decidir.

**Actualización (T003, 2026-11-25), medido con la clave real**:

- **Cuota diaria mínima**: la capa gratuita de `gemini-3.5-flash` y `gemini-3.6-flash` tiene un
  límite de **20 solicitudes por día, por proyecto y por modelo**
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Se agotó tras unas 20 llamadas del spike.
- **Sobrecarga**: `gemini-3.5-flash-lite` y `gemini-3.8-flash` devolvieron 503 ("high demand") en
  la mayoría de los intentos, incluso tras los reintentos de la app.

Con 3–24 llamadas por práctica, la capa gratuita **no alcanza ni para el piloto**: como mucho, una
práctica al día en toda la plataforma. Tampoco permite correr el dataset dorado en vivo (11 casos del
evaluador + 6 guiones multi-turno).

**Nueva decisión recomendada**: activar la facturación (capa de pago) en el proyecto de Google
**antes del piloto**, con un tope de presupuesto en Google Cloud. La capa de pago además deja de usar
los datos para mejorar los productos de Google.

Costo estimado por práctica a precio estándar (`src/lib/ai/pricing.ts`):

| Llamada | Tokens aproximados | Costo |
| --- | --- | --- |
| 20 turnos con `3.5-flash-lite` | ≈ 60 k de entrada + 4 k de salida | ≈ US$ 0,03 |
| Ficha con `3.6-flash` | ≈ 3 k + 1,5 k | ≈ US$ 0,016 |
| Evaluación con `3.6-flash` | ≈ 10 k + 4 k (con razonamiento) | ≈ US$ 0,045 |
| **Total** | | **≈ US$ 0,09** |

Las tarifas de `3.6-flash` y `3.8-flash` son promocionales a la mitad hasta el 2026-12-31. El
código no cambia: solo la clave.

**Alternativas consideradas**: cachear respuestas (no aplica a conversaciones); modelo local (fuera
del stack y del presupuesto de infraestructura).
