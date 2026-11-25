# Contrato: funciones de base de datos (002)

Convenciones de [001/contracts/database-rpc.md](../../001-platform-foundation/contracts/database-rpc.md):
`security definer`, `set search_path = ''`, nombres calificados, `REVOKE ALL … FROM public` y
`GRANT EXECUTE` explícito, errores por `ERRCODE`. Las funciones `authenticated` verifican siempre
`private.current_session_ok()`, que la organización esté en `private.active_org_ids()` con rol
`vendedor` y, en recursos de práctica, que `user_id = auth.uid()`; si no → `P0002` (no revela
existencia). Las funciones `service_role` reciben `p_user_id` del servidor (ya autenticado por el
guard) y **repiten** la verificación de pertenencia activa y dueño.

Nuevos ERRCODE:

| ERRCODE | Significado | ErrorCode TS |
|---|---|---|
| `P0020` | cuota agotada; `DETAIL` = `daily:<renews_at ISO>` \| `monthly:<renews_at ISO>` \| `disabled` | `quota_exhausted` |
| `P0021` | tope de configuraciones del día; `DETAIL` = `success:<retry_at>` \| `failure:<retry_at>` | `setup_limit` |
| `P0022` | ya existe una sesión activa; `DETAIL` = `<session_id>` | `active_session` |
| `P0010` | conflicto de estado (`DETAIL`: `not_configured`, `expired`, `not_active`, `turn_in_progress`, `message_limit`, `no_seller_messages`, `not_failed`, `retries_exhausted`, `hint_already_used`, `objection_limit`, `version_mismatch`, `product_archived`) | `conflict` |

## Expuestas a `authenticated`

### Productos y objeciones

| Función | Devuelve | Notas |
|---|---|---|
| `create_product(p_org uuid, p_payload jsonb, p_idempotency_key uuid)` | `table(product_id uuid, duplicate boolean)` | valida payload (mismas reglas que Zod, `23514`); crea `products` + `product_versions` v1 en una transacción; idempotente por clave (`ON CONFLICT DO NOTHING` + relectura) |
| `update_product(p_product uuid, p_expected_version int, p_payload jsonb)` | `table(version int, unchanged boolean)` | `FOR UPDATE` del producto; `current_version <> p_expected_version` → `P0010 version_mismatch`; si el contenido es idéntico a la vigente → `unchanged = true` sin versión nueva; si no, inserta versión `+1` y actualiza `current_version`, `current_name` |
| `set_product_status(p_product uuid, p_status product_status)` | `void` | idempotente; audita `product.archived` / `product.reactivated` |
| `create_objection(p_product uuid, p_text text, p_category objection_category)` | `uuid` | `FOR UPDATE` del producto; > 20 → `P0010 objection_limit` |
| `update_objection(p_objection uuid, p_text text, p_category objection_category)` | `void` | |
| `delete_objection(p_objection uuid)` | `void` | audita `objection.deleted` (`{ product_id }`) |

### Práctica (sin contenido generado por IA)

| Función | Devuelve | Notas |
|---|---|---|
| `practice_quota_status()` | `table(daily_used int, daily_limit int, monthly_used int, monthly_limit int, remaining_today int, remaining_month int, exhausted_scope text, renews_at timestamptz, setup_success_today int, setup_failure_today int, setup_retry_at timestamptz)` | de la organización personal del usuario; días/meses en la zona de la organización |
| `check_practice_setup(p_product uuid, p_objection_ids uuid[])` | `table(product_version_id uuid, sector product_sector, objections jsonb)` | sin efectos; en orden: sesión activa → `P0022`; cuota → `P0020`; topes → `P0021`; producto activo de la org → si no `P0002`/`P0010 product_archived`; objeciones del producto (1–3) → si no `P0002`. Devuelve los datos necesarios para el prompt |
| `start_practice_session(p_session uuid)` | `table(session_id uuid, already_active boolean)` | `FOR UPDATE` de la sesión; si `active` → `already_active = true`; si no `configured` o vencida → `P0010`; bloquea `quotas` de la org (`FOR UPDATE`), recalcula uso → `P0020`; inserta `simulation_consumptions`, mensaje `m1` (autor `buyer`, contenido de `opening_message`, `interest_after` inicial), fija `status = active`, `started_at`, `deadline_at = now() + 20 min`, `interest` inicial, `last_seq = 1`. El índice único parcial garantiza una sola activa (`23505` → `P0022`) |
| `begin_practice_turn(p_session uuid, p_client_message_id uuid, p_text text)` | `table(seller_seq int, already_answered boolean, buyer_seq int)` | `FOR UPDATE`; si existe mensaje con ese `client_message_id`: si tiene respuesta → `already_answered = true`; si no, reutiliza su `seq`. Si no existe: exige `active`, `now() < deadline_at` (si venció, cierra por `time_limit` en la misma transacción y lanza `P0010 not_active`), `seller_message_count < 20`, sin lease vigente (`P0010 turn_in_progress`); inserta el mensaje del vendedor con `seq = last_seq + 1`, incrementa contadores. En ambos casos fija `turn_lock_seq` y `turn_lock_expires_at = now() + 90 s` |
| `finish_practice_session(p_session uuid)` | `table(evaluation_status evaluation_status)` | `active` con ≥ 1 mensaje del vendedor y sin lease vigente → `finalized`, `seller_ended`, `pending`, `evaluation_due_at = now() + 3 min`; ya finalizada → devuelve su estado (idempotente); sin mensajes → `P0010 no_seller_messages` |
| `request_practice_hint(p_session uuid)` | `table(hints_used int)` | `active` + `hints_enabled`; una por turno (`last_hint_at_seller_count = seller_message_count` → `P0010 hint_already_used`) |
| `retry_practice_evaluation(p_session uuid)` | `table(manual_retries_left int)` | solo `failed` (`P0010 not_failed`) y `manual_retries < 3` (`P0010 retries_exhausted`); `pending`, `manual_retries + 1`, `auto_attempts = 0`, nuevo `evaluation_due_at` |
| `my_practice_stage_averages(p_from date, p_to date, p_product uuid, p_difficulty smallint, p_last_n int)` | `table(stage cautiva_stage, avg_pct numeric, evaluated_criteria int)` | `security invoker` (RLS); solo sesiones `evaluated` del usuario; `p_last_n` (Hoy = 5) o filtros (Historial); etapas sin datos con `avg_pct = NULL`; orden canónico |
| `my_practice_history(p_from date, p_to date, p_product uuid, p_difficulty smallint, p_limit int, p_offset int)` | `table(session_id, product_id, product_name, product_version, difficulty, started_at, status, evaluation_status, total_score, level, total_count)` | `security invoker`; solo comenzadas (FR-049); fechas en la zona de la org |

## Solo `service_role`

| Función | Devuelve | Notas |
|---|---|---|
| `create_configured_practice(p_user uuid, p_payload jsonb)` | `table(session_id uuid, duplicate boolean)` | `pg_advisory_xact_lock(hash(user))`; idempotente por `setup_idempotency_key`; repite verificación de sesión activa (`P0022`); descarta la configurada previa (`discarded`); inserta sesión (versión de producto, copias de objeciones, dificultad, pistas, foco, prompts y modelos), `practice_buyer_profiles`, `practice_session_secrets` y `practice_setup_attempts(success)`. Valida longitudes y presupuesto vs. precio (`23514`) |
| `record_practice_setup_failure(p_user uuid, p_failure_code text)` | `void` | inserta `practice_setup_attempts(failure)` |
| `get_practice_turn_context(p_user uuid, p_session uuid)` | `jsonb` | escenario completo (incl. secretos), versión del producto, historial `seq/author/content`, revelados, contadores; para construir el prompt del cliente |
| `commit_practice_turn(p_user uuid, p_session uuid, p_seller_seq int, p_reply text, p_meta jsonb, p_meta_status turn_meta_status, p_provider_wait_ms int)` | `table(buyer_seq int, state jsonb, ended boolean, end_reason practice_end_reason, evaluation_status evaluation_status)` | exige lease de ese `seq`; aplica `private.apply_turn_rules` (data-model); inserta mensaje del cliente con metadatos, inserta `practice_session_reveals` (copia valores desde secretos), suma espera a `provider_wait_ms` y `deadline_at`; si termina: `finalized`, `end_reason`, `ended_at`, `evaluation_status = pending` (o `not_applicable`), `evaluation_due_at`; libera el lease |
| `release_practice_turn(p_user uuid, p_session uuid, p_seller_seq int, p_provider_wait_ms int)` | `void` | fallo sin turno: libera lease y suma la espera; el mensaje del vendedor queda sin respuesta |
| `claim_practice_evaluation(p_session uuid)` | `jsonb` o NULL | `FOR UPDATE SKIP LOCKED`; solo `pending` en org activa (tras un intento fallido, `fail_practice_evaluation_attempt` la devuelve a `pending` y `runEvaluation` la vuelve a tomar); pasa a `in_progress`, `phase = reading`; devuelve transcripción, escenario completo, versión de producto y rúbrica vigente (criterios, pesos, etapas, anclas) |
| `set_practice_evaluation_phase(p_session uuid, p_phase evaluation_phase)` | `void` | progreso visible |
| `save_practice_evaluation(p_session uuid, p_payload jsonb)` | `uuid` | re-valida (criterios completos y únicos de la rúbrica, `max_score = weight`, rangos, `score` NULL en no evaluables, ≥ 1 evidencia por evaluado, todo `seq` citado es del vendedor en la sesión; `23514` si falla); recalcula total y nivel; inserta evaluación + criterios + banderas; `status = evaluated`, `evaluation_status = NULL` |
| `fail_practice_evaluation_attempt(p_session uuid, p_failure_code text)` | `table(evaluation_status evaluation_status)` | `auto_attempts + 1`; si `< 3` y quedan > 50 s del plazo → `pending`; si no → `failed` (o `unavailable` si `manual_retries = 3`) |
| `insert_ai_usage(p_row jsonb)` | `void` | inserta `ai_usage` (sin contenido) |

## Privadas (no expuestas)

| Función | Notas |
|---|---|
| `private.practice_quota_status(org uuid)` | usada por las anteriores |
| `private.apply_turn_rules(...)` | reglas FR-027/FR-028/FR-034 (data-model) |
| `private.compute_evaluation_total(evaluation jsonb)` | FR-041/FR-042 |
| `private.run_practice_maintenance()` | `pg_cron` `* * * * *` (`practice-maintenance`): cierre por tiempo (también en organizaciones suspendidas: no invoca a la IA; la evaluación queda `pending` y aplazada), descarte 24 h, leases vencidos, evaluaciones vencidas → `failed`/`unavailable`, aplazar organizaciones suspendidas, despacho `pg_net` de hasta 5 `pending` con > 20 s (URL y secreto desde `vault.decrypted_secrets`, nombres `practice_dispatch_url` y `practice_dispatch_secret`), purga de `practice_setup_attempts` > 40 días |

## Cambios a funciones de 001

- `admin_usage_summary` y `admin_list_organizations`: `simulations`/`month_simulations` se cuentan
  en `simulation_consumptions` (mismo criterio de días en la zona de cada organización). Firmas sin
  cambios.
- `private.write_audit`: se añaden a la lista blanca las acciones `product.archived`,
  `product.reactivated` (`data: {}`) y `objection.deleted` (`data: { product_id }`).

## Grants y políticas

- `anon`: ninguna función ni tabla nueva.
- Tablas nuevas: sin `INSERT/UPDATE/DELETE` para `authenticated` (todo vía funciones); `SELECT` según
  [data-model.md](../data-model.md#clasificación-de-tablas-nuevas).
- pgTAP verifica para cada función `authenticated`: usuario de otra organización → `P0002`; sesión
  inválida → `42501`; organización suspendida → `42501`.
