# Data Model: Práctica del vendedor

**Feature**: `002-seller-practice` | **Fecha**: 2026-11-24 | **Plan**: [plan.md](./plan.md)

Se suma al modelo de [001](../001-platform-foundation/data-model.md) (mismas convenciones: `uuid`
con `gen_random_uuid()`, `timestamptz` UTC, RLS activo en todas las tablas, helpers
`private.active_org_ids()`, `private.current_session_ok()`, `private.is_superadmin()`).
Todas las tablas nuevas, salvo la rúbrica (plataforma), tienen `organization_id NOT NULL` con FK e
índice. Las tablas de práctica guardan además `user_id` (el vendedor que practicó) para que la RLS de
"solo el dueño" sea barata y explícita (FR-054).

## Clasificación de tablas nuevas

| Tabla | Tipo | `organization_id` | Lectura (RLS) |
|---|---|---|---|
| `products`, `product_versions`, `objections` | Negocio | NOT NULL + índice | miembros de la org |
| `practice_sessions`, `practice_buyer_profiles`, `practice_session_reveals`, `practice_messages` | Negocio (contenido) | NOT NULL + índice | solo el dueño |
| `practice_session_secrets` | Negocio (contenido oculto) | NOT NULL + índice | solo el dueño y solo con sesión `finalized`/`evaluated` |
| `practice_evaluations`, `practice_evaluation_criteria`, `practice_ethical_flags` | Negocio (contenido) | NOT NULL + índice | solo el dueño |
| `practice_setup_attempts` | Negocio (control de costo) | NOT NULL + índice | ninguna (solo funciones) |
| `simulation_consumptions` | Negocio (cuota, sin contenido) | NOT NULL + índice | dueño; superadmin solo vía funciones `admin_*` agregadas |
| `rubrics`, `rubric_criteria` | Plataforma (referencia) | no aplica | `authenticated` |

La prueba guardiana de 001 se actualiza: `rubrics` y `rubric_criteria` se añaden a la lista de
plataforma; el resto debe cumplir la regla. El superadmin **no** tiene políticas de `SELECT` sobre
ninguna tabla de contenido (FR-056); `admin_*` solo pueden leer `organizations`, `quotas`,
`ai_usage` y `simulation_consumptions` (la prueba pgTAP de 001 que inspecciona dependencias se
amplía con esta lista).

## Tipos enumerados nuevos

```text
product_sector        = real_estate | hardware | telecom | cooperative | restaurants | education | b2b_services | other
product_status        = active | archived
price_kind            = fixed | range
objection_category    = price | trust | time | competition | logistics | decision_maker
cautiva_stage         = conoce | aumenta | une | transforma | innova | vende | asegura   (orden canónico)
practice_status       = configured | active | finalized | evaluated | discarded
evaluation_status     = pending | in_progress | failed | unavailable | not_applicable
evaluation_phase      = reading | scoring | reporting
practice_end_reason   = goal_achieved | buyer_abandoned | message_limit | time_limit | seller_ended
message_author        = seller | buyer
turn_meta_status      = valid | corrected | fallback
revealable_key        = budget | timeline | decision_maker
criterion_status      = evaluated | no_evaluable
score_level           = reinforcement | developing | competent | advanced
ethical_flag_type     = unfounded_promise | undue_pressure
setup_outcome         = success | failure
ai_call_outcome       = success | retry | failure
```

Cambios a enums de 001: `ai_task` añade `buyer_setup` (la ficha); `buyer` = turnos del cliente;
`evaluator` = evaluación.

Etiquetas de UI (solo en TS): sectores (Inmobiliaria, Ferretería, Telecom, Cooperativa,
Restaurantes, Educación, Servicios B2B, Otro); categorías (Precio, Confianza, Tiempo, Competencia,
Distancia/logística, Decisor); etapas (Conoce, Aumenta, Une, Transforma, Innova, Vende, Asegura);
niveles (Refuerzo, En desarrollo, Competente, Avanzado); motivos de fin (Cierre logrado, Abandono del
cliente, Límite de mensajes, Límite de tiempo, Terminada por el vendedor).

---

## Productos y objeciones

### products

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations | NOT NULL |
| created_by | uuid → auth.users | NOT NULL |
| status | product_status | NOT NULL DEFAULT `active` |
| current_version | integer | NOT NULL, ≥ 1 (número de la versión vigente) |
| current_name | text | NOT NULL; copia del nombre vigente para búsqueda y orden (la mantiene `update_product`) |
| archived_at | timestamptz | NULL; NOT NULL si `status = archived` |
| create_idempotency_key | uuid | NULL, UNIQUE |
| created_at, updated_at | timestamptz | |

Índices: `(organization_id, status, updated_at desc)`, `(organization_id, lower(current_name))`.
Sin DELETE (FR-003).

### product_versions (inmutable)

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations | NOT NULL (igual a la del producto; trigger) |
| product_id | uuid → products | NOT NULL |
| version | integer | NOT NULL, ≥ 1; UNIQUE `(product_id, version)` |
| sector | product_sector | NOT NULL |
| name | text | NOT NULL, 2–120, no solo espacios |
| description | text | NOT NULL DEFAULT `''`, ≤ 1.000 |
| price_kind | price_kind | NOT NULL |
| price_min | numeric(12,2) | NOT NULL, ≥ 0 |
| price_max | numeric(12,2) | NOT NULL, ≥ `price_min`; `= price_min` si `price_kind = fixed` |
| benefits | text[] | NOT NULL, 1–10 elementos, cada uno 1–200 |
| differentiators | text[] | NOT NULL DEFAULT `{}`, 0–10, cada uno 1–200 |
| verifiable_facts | text[] | NOT NULL DEFAULT `{}`, 0–10, cada uno 1–200 |
| created_by | uuid → auth.users | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Trigger `BEFORE UPDATE OR DELETE` → excepción (FR-002). Índice `(organization_id, product_id)`.
Validación de arreglos con `private.valid_text_array(arr, min, max, maxlen)` en CHECK.

### objections

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations | NOT NULL |
| product_id | uuid → products | NOT NULL |
| text | text | NOT NULL, 5–300, no solo espacios |
| category | objection_category | NULL |
| created_at, updated_at | timestamptz | |

Máximo 20 por producto: lo aplica `create_objection` con `FOR UPDATE` sobre el producto (FR-006).
Borrado físico permitido (las sesiones guardan copia del texto, FR-008). Índice
`(organization_id, product_id, created_at)`.

---

## Rúbrica (plataforma, inmutable)

### rubrics

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| slug | text | NOT NULL (`ventas-consultivas`) |
| name | text | NOT NULL (`Ventas consultivas`) |
| version | text | NOT NULL (`1.0`); UNIQUE `(slug, version)` |
| is_current | boolean | NOT NULL; índice único parcial `(slug) WHERE is_current` |
| published_at | timestamptz | NOT NULL |

### rubric_criteria

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| rubric_id | uuid → rubrics | NOT NULL |
| key | text | NOT NULL, `^[a-z_]+$`; UNIQUE `(rubric_id, key)`; es el `criterion_id` del Anexo A |
| name | text | NOT NULL |
| weight | smallint | NOT NULL, 1–100 |
| stages | cautiva_stage[] | NOT NULL, ≥ 1, sin duplicados (FR-037) |
| description | text | NOT NULL |
| anchors | jsonb | NOT NULL: `{ "low": "...", "mid": "...", "high": "..." }` (anclas de desempeño) |
| position | smallint | NOT NULL; UNIQUE `(rubric_id, position)` |

Trigger: suma de pesos = 100 y toda etapa cubierta (verificado por función `private.assert_rubric_complete(rubric_id)` al publicar); `BEFORE UPDATE OR DELETE` → excepción. **Se publica en una migración** (no en `seed.sql`, que nunca corre en producción).

**Contenido v1.0** (FR-036, FR-037):

| position | key | name | weight | stages |
|---|---|---|---|---|
| 1 | `first_impression` | Primera impresión y confianza | 10 | `{conoce}` |
| 2 | `diagnosis` | Diagnóstico y preguntas | 20 | `{conoce}` |
| 3 | `active_listening` | Escucha activa y empatía | 10 | `{une}` |
| 4 | `value_argument` | Argumentación de valor | 20 | `{aumenta, transforma}` |
| 5 | `objection_handling` | Manejo de objeciones | 15 | `{innova}` |
| 6 | `negotiation_close` | Negociación y cierre | 15 | `{vende}` |
| 7 | `follow_up` | Seguimiento y siguiente paso | 10 | `{asegura}` |

---

## Sesiones de práctica

### practice_sessions

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations | NOT NULL |
| user_id | uuid → auth.users | NOT NULL |
| product_id | uuid → products | NOT NULL |
| product_version_id | uuid → product_versions | NOT NULL (versión exacta, FR-002) |
| product_version | integer | NOT NULL (copia para mostrar "v3") |
| status | practice_status | NOT NULL DEFAULT `configured` |
| difficulty | smallint | NOT NULL, 1–5 |
| hints_enabled | boolean | NOT NULL DEFAULT true |
| focus_stage | cautiva_stage | NULL (FR-009) |
| selected_objection_ids | uuid[] | NOT NULL, 1–3 (referencia informativa para "Practicar de nuevo"; sin FK) |
| visible_objection | text | NOT NULL, 5–300 (copia, FR-008) |
| visible_objection_category | objection_category | NULL |
| interest | smallint | NOT NULL, 0–100; inicial según dificultad (55/50/45/35/25) |
| last_interest_delta | smallint | NOT NULL DEFAULT 0, −15…15 |
| seller_message_count | smallint | NOT NULL DEFAULT 0, 0–20 |
| last_seq | integer | NOT NULL DEFAULT 0 (último `seq` de mensaje) |
| hints_used | smallint | NOT NULL DEFAULT 0 |
| last_hint_at_seller_count | smallint | NULL (máx. 1 pista por turno) |
| end_reason | practice_end_reason | NULL; NOT NULL si `status in (finalized, evaluated)` |
| setup_idempotency_key | uuid | NOT NULL, UNIQUE |
| configured_at | timestamptz | NOT NULL DEFAULT now() |
| configured_expires_at | timestamptz | NOT NULL (= `configured_at + 24 h`) |
| started_at | timestamptz | NULL; NOT NULL si `status <> configured/discarded` |
| deadline_at | timestamptz | NULL; `started_at + 20 min + provider_wait_ms` (se recalcula al sumar espera) |
| provider_wait_ms | integer | NOT NULL DEFAULT 0 |
| ended_at | timestamptz | NULL |
| discarded_at | timestamptz | NULL |
| turn_lock_seq | integer | NULL; `seq` del mensaje del vendedor en proceso |
| turn_lock_expires_at | timestamptz | NULL (lease 90 s) |
| evaluation_status | evaluation_status | NULL mientras no está `finalized`/`evaluated` |
| evaluation_phase | evaluation_phase | NULL |
| evaluation_due_at | timestamptz | NULL (inicio de `pending` + 3 min) |
| evaluation_auto_attempts | smallint | NOT NULL DEFAULT 0 (de la ronda actual, ≤ 3) |
| evaluation_manual_retries | smallint | NOT NULL DEFAULT 0, 0–3 |
| evaluation_failure_code | text | NULL; código técnico (`invalid_output`, `provider_error`, `timeout`), sin contenido |
| buyer_setup_prompt_version | text | NOT NULL |
| buyer_prompt_version | text | NOT NULL (fijada al configurar) |
| buyer_setup_model, buyer_model | text | NOT NULL |
| created_at, updated_at | timestamptz | |

Índices: único parcial `(user_id) WHERE status = 'active'`; único parcial `(user_id) WHERE status =
'configured'`; `(organization_id, user_id, started_at desc) WHERE started_at IS NOT NULL`
(historial); `(status, deadline_at) WHERE status = 'active'`; `(status, configured_expires_at) WHERE
status = 'configured'`; `(evaluation_status, evaluation_due_at) WHERE evaluation_status in
('pending','in_progress')`.

CHECKs de coherencia: `evaluation_status IS NULL` ⇔ `status in (configured, active, discarded)`;
`status = evaluated` ⇒ `evaluation_status IS NULL` y existe evaluación (función); `status =
finalized` ⇒ `evaluation_status IS NOT NULL`.

**Transiciones** (solo vía funciones de servidor, FR-020):

```text
                 start (cuota OK)                 fin (reglas FR-028/029)
 configured ─────────────────────▶ active ────────────────────────────────▶ finalized
   │   │                                                                        │
   │   └─ nueva configuración / 24 h ─▶ discarded (final)                       │
   │                                                                            ▼
   └──(nunca vuelve)                                      evaluation_status:
                                                          not_applicable (sin mensajes del vendedor; final)
                                                          pending ──claim──▶ in_progress ──valid──▶ (status = evaluated)
                                                             ▲                    │ inválida ×3 / 3 min
                                                             │ reintento manual   ▼
                                                             └──── (≤ 3) ───── failed ──3.er reintento fallido──▶ unavailable (final)
```

Una sesión `finalized` con `unavailable` o `not_applicable` no cuenta en puntajes, gráfico ni
promedios (FR-043). Una sesión `evaluated` tiene exactamente una fila en `practice_evaluations`.

### practice_buyer_profiles (ficha pública)

| Columna | Tipo | Reglas |
|---|---|---|
| session_id | uuid PK → practice_sessions | |
| organization_id, user_id | uuid | NOT NULL (copias de la sesión) |
| name | text | NOT NULL, 2–60 (ficticio, FR-013) |
| age | smallint | NOT NULL, 18–80 |
| occupation | text | NOT NULL, 2–80 |
| intro | text | NOT NULL, 20–280 (presentación breve) |
| goal | text | NOT NULL, 10–160 (meta, p. ej. "Agendar una visita al lote") |
| revealable_labels | revealable_key[] | NOT NULL (siempre `{budget,timeline,decision_maker}` en v1) |

### practice_session_secrets (oculto hasta finalizar)

| Columna | Tipo | Reglas |
|---|---|---|
| session_id | uuid PK → practice_sessions | |
| organization_id, user_id | uuid | NOT NULL |
| motivation | text | NOT NULL, 10–300 |
| personality | text | NOT NULL, 10–300 |
| revealables | jsonb | NOT NULL: `[{ key: revealable_key, value: text(1–160), budget_min?: numeric, budget_max?: numeric }]`, una por clave |
| hidden_objections | jsonb | NOT NULL: `[{ id: 'h1', text: 5–300, category?: objection_category, source: 'seller' \| 'generated' }]`, 1–2 elementos |
| opening_message | text | NOT NULL, 1–600 (se copia como `m1` al comenzar) |

RLS: `SELECT` solo si `user_id = auth.uid()` ∧ org activa ∧ la sesión está `finalized` o
`evaluated`. Sin escritura desde el cliente.

### practice_session_reveals (lo descubierto)

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id, user_id | uuid | NOT NULL |
| session_id | uuid → practice_sessions | NOT NULL |
| kind | text | NOT NULL, `revealable` \| `hidden_objection` |
| item_key | text | NOT NULL (`budget`/`timeline`/`decision_maker` o `h1`/`h2`) |
| value | text | NOT NULL (valor o texto de la objeción, copiado de los secretos) |
| message_seq | integer | NOT NULL (mensaje del cliente donde ocurrió) |
| revealed_at | timestamptz | NOT NULL DEFAULT now() |

UNIQUE `(session_id, kind, item_key)` (un dato se descubre una vez). Índice `(organization_id,
session_id)`.

### practice_messages (inmutable)

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id, user_id | uuid | NOT NULL |
| session_id | uuid → practice_sessions | NOT NULL |
| seq | integer | NOT NULL, ≥ 1; UNIQUE `(session_id, seq)`; id visible `m{seq}` (FR-022) |
| author | message_author | NOT NULL; `seq = 1` siempre `buyer` |
| content | text | NOT NULL; vendedor 1–1.000 (sin solo espacios); cliente 1–700 (600 + despedida de respaldo) |
| client_message_id | uuid | NULL; NOT NULL si `author = seller`; UNIQUE `(session_id, client_message_id)` |
| reply_to_seq | integer | NULL; en mensajes del cliente, el `seq` del vendedor al que responden |
| interest_before, interest_after | smallint | NULL en vendedor; 0–100 en cliente |
| interest_delta | smallint | NULL en vendedor; −15…15 |
| revealed_keys | text[] | NOT NULL DEFAULT `{}` |
| hidden_objection_raised | text | NULL (`h1`/`h2`) |
| seller_abusive | boolean | NULL en vendedor |
| ends_session | boolean | NOT NULL DEFAULT false |
| meta_status | turn_meta_status | NULL en vendedor |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Trigger `BEFORE UPDATE OR DELETE` → excepción (FR-022). Índice `(organization_id, session_id, seq)`.
Un mensaje del vendedor sin mensaje del cliente con `reply_to_seq` igual es un turno **sin
respuesta** (retomable con "Reintentar").

---

## Evaluación

### practice_evaluations (inmutable)

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id, user_id | uuid | NOT NULL |
| session_id | uuid → practice_sessions | NOT NULL, UNIQUE (una evaluación válida como máximo) |
| rubric_id | uuid → rubrics | NOT NULL |
| rubric_version | text | NOT NULL (copia, `1.0`) |
| prompt_version | text | NOT NULL (`evaluator@1.1.0`) |
| model | text | NOT NULL |
| total_score | smallint | NULL si ningún criterio evaluable; 0–100 (recalculado en SQL, FR-041) |
| level | score_level | NULL ⇔ `total_score` NULL (FR-042) |
| strengths | text[] | NOT NULL, 0–5, cada uno ≤ 200 |
| improvements | text[] | NOT NULL, 0–5, cada uno ≤ 200 |
| suggested_drill_text | text | NOT NULL, 1–300 |
| suggested_drill_stage | cautiva_stage | NOT NULL |
| auto_attempts | smallint | NOT NULL (intentos de la ronda que produjo esta evaluación) |
| manual_retries | smallint | NOT NULL (reintentos manuales usados) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

### practice_evaluation_criteria (inmutable)

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id, user_id | uuid | NOT NULL |
| evaluation_id | uuid → practice_evaluations | NOT NULL |
| criterion_id | uuid → rubric_criteria | NOT NULL; UNIQUE `(evaluation_id, criterion_id)` |
| status | criterion_status | NOT NULL |
| score | smallint | NULL ⇔ `no_evaluable`; si evaluado `0 ≤ score ≤ max_score` |
| max_score | smallint | NOT NULL, = `rubric_criteria.weight` (trigger) |
| evidence_seqs | integer[] | NOT NULL; ≥ 1 si evaluado; cada uno mensaje del vendedor de la sesión (verificado en `save_practice_evaluation`) |
| justification | text | NOT NULL, 1–600 |
| improvement | text | NOT NULL, 0–400 |
| confidence | numeric(3,2) | NOT NULL, 0–1 (UI: Alta ≥ 0,75, Media ≥ 0,5, Baja < 0,5) |

### practice_ethical_flags (inmutable)

| Columna | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| organization_id, user_id | uuid | NOT NULL |
| evaluation_id | uuid → practice_evaluations | NOT NULL |
| type | ethical_flag_type | NOT NULL |
| explanation | text | NOT NULL, 1–400 |
| message_seqs | integer[] | NOT NULL, ≥ 1; solo mensajes del vendedor |

Trigger `BEFORE UPDATE OR DELETE` → excepción en las tres tablas (FR-044, SC-004).

**Cálculos** (idénticos en TS y SQL, misma tabla de casos en Vitest y pgTAP):

```text
total  = round(100 * Σ score(evaluated) / Σ max_score(evaluated))     -- NULL si no hay evaluados
level  = 0–59 reinforcement · 60–74 developing · 75–89 competent · 90–100 advanced
stage% = avg(score/max_score) de los criterios evaluados asociados a la etapa  -- "sin datos" si ninguno
```

`round` es "mitad hacia arriba" (`round(numeric)` en Postgres; `Math.round` sobre el valor positivo
en TS).

---

## Cuota y control de costo

### simulation_consumptions

| Columna | Tipo | Reglas |
|---|---|---|
| session_id | uuid PK → practice_sessions | una consumición por sesión (FR-018) |
| organization_id | uuid → organizations | NOT NULL |
| user_id | uuid → auth.users | NOT NULL |
| consumed_at | timestamptz | NOT NULL DEFAULT now() |

Índice `(organization_id, consumed_at)`. Sin UPDATE/DELETE. `SELECT` del dueño; agregados del
superadmin vía `admin_*`.

### practice_setup_attempts

| Columna | Tipo | Reglas |
|---|---|---|
| id | bigint identity PK | |
| organization_id | uuid → organizations | NOT NULL |
| user_id | uuid → auth.users | NOT NULL |
| outcome | setup_outcome | NOT NULL |
| failure_code | text | NULL (`provider_unavailable`, `invalid_persona`), sin contenido |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Índice `(organization_id, user_id, created_at)`. Retención: purga > 40 días en el mantenimiento.

### ai_usage (cambios sobre 001)

- `simulation_id` recibe FK → `practice_sessions(id)` (`ON DELETE RESTRICT`; las sesiones no se
  borran). Sigue siendo NULL en las filas de `task = buyer_setup`, porque la ficha se genera antes de
  crear la sesión y un intento fallido no la crea (FR-019). En `buyer` y `evaluator` siempre se
  informa.
- Nueva columna `outcome ai_call_outcome NOT NULL DEFAULT 'success'` (FR-019: éxito, reintento,
  fallo), `attempt smallint NOT NULL DEFAULT 1` y `first_chunk_ms integer NULL` (≥ 0; solo en
  turnos en streaming, para medir SC-007).
- Se inserta una fila por **intento** de llamada (incluidos los fallidos, con tokens 0 si el
  proveedor no los informa), desde el servidor con la clave secreta.

---

## Funciones de dominio en SQL (resumen; firmas en [contracts/database-rpc.md](./contracts/database-rpc.md))

- `private.practice_quota_status(org)` → usados/límites día y mes en la zona de la organización,
  restantes y `renews_at`.
- `private.initial_interest(difficulty)` → 55/50/45/35/25.
- `private.mood(interest)` → 0–29 `distrustful`, 30–54 `doubtful`, 55–79 `interested`, 80–100
  `ready` (también en TS para la UI).
- `private.apply_turn_rules(...)` → usado por `commit_practice_turn`:
  1. `delta' = clamp(delta, −15, 15)`; `interest' = clamp(interest + delta', 0, 100)`.
  2. Si `seller_message_count ≤ 3` y no abusivo → `interest' = max(interest', 11)`.
  3. Abandono si `interest' ≤ 10` y (`seller_message_count ≥ 4` o abusivo) → `buyer_abandoned`.
  4. Cierre si el modelo marcó `goal_achieved` y `interest' ≥ 80` → `goal_achieved` (si no, se
     ignora y `meta_status = corrected`).
  5. Si no terminó y `seller_message_count = 20` → `message_limit`.
  6. Revelados: solo claves de la ficha aún no reveladas; objeción oculta: solo ids existentes.
- `private.run_practice_maintenance()` (pg_cron cada minuto): ver research R8.

## Seed de desarrollo (`supabase/seed.sql`, solo local/CI)

Para A y B: dos productos (inmobiliaria con datos verificables tipo Sunarp y ferretería sin
diferenciadores), uno archivado; objeciones de varias categorías; una sesión `evaluated` con
evaluación completa (para resultado, historial y Hoy), una `finalized` con `failed` (2 reintentos
manuales usados) y una `finalized` `not_applicable`. Para C: sin productos (estado vacío guiado). La
fila de Vault con la URL local del despachador (`http://host.docker.internal:3000`) y su secreto de
desarrollo. Las e2e que mutan estado crean sus propios datos con factorías (convención de 001).
