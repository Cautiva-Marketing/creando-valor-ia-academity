# Quickstart: validación de la práctica del vendedor

**Feature**: `002-seller-practice` | **Plan**: [plan.md](./plan.md)

Guía para comprobar de punta a punta que la feature funciona. No contiene implementación; las
reglas están en [data-model.md](./data-model.md) y los contratos en [contracts/](./contracts/).

## Requisitos previos

- Entorno de 001 funcionando (`pnpm install`, Docker, `pnpm supabase start`, `.env.local` según
  `.env.example`).
- Variables nuevas en `.env.local`:
  - `AI_PROVIDER=fake` para validar sin red ni costo (proveedor determinista, research R2), o
    `AI_PROVIDER=google` + `GOOGLE_GENERATIVE_AI_API_KEY` para probar con Gemini real.
  - `AI_MODEL_BUYER_SETUP`, `AI_MODEL_BUYER`, `AI_MODEL_EVALUATOR` (valores en `.env.example`).
  - `PRACTICE_DISPATCH_SECRET` (≥ 32 bytes aleatorios; el mismo valor que carga `seed.sql` en Vault
    para local).
- **Solo datos ficticios** (constitución, Principio II): la capa gratuita de Gemini puede usar los
  datos para mejorar el servicio.

## Preparación

```bash
pnpm supabase db reset      # migraciones de 002 (rúbrica v1.0 incluida) + seed local
pnpm dev
```

Comprobaciones rápidas de BD (Studio en `http://127.0.0.1:54323` o `psql`):

- `select key, weight, stages from rubric_criteria order by position;` → 7 criterios, pesos que
  suman 100, asociación de FR-037.
- `select jobname, schedule from cron.job;` → incluye `practice-maintenance` (`* * * * *`).
- `select name from vault.decrypted_secrets where name like 'practice_dispatch_%';` → URL y secreto.

## Escenarios de validación manual (vendedor A del seed, móvil 360 px y teclado)

| # | Escenario | Resultado esperado | Ref. |
|---|---|---|---|
| 1 | Vendedor C (sin productos) abre **Hoy** | Pasos guiados; navegación Hoy/Practicar/Historial/Mis productos | US9, FR-052 |
| 2 | Registrar producto con rango `S/ 45 000 – S/ 60 000`, 2 beneficios y un dato verificable; probar nombre vacío y mínimo > máximo | Errores por campo sin perder lo escrito; luego v1 activo en la lista | US1 |
| 3 | Editar el producto | "Versión 2"; pestaña Versiones muestra v1 y v2 | FR-002 |
| 4 | Agregar objeción desde sugerencia (categoría preseleccionada) y otra a mano; intentar la nº 21 | Lista con categoría; mensaje de máximo | US2 |
| 5 | **Practicar**: producto, 1 objeción, dificultad 3, pistas activas | Progreso de generación → pantalla previa sin objeción oculta ni valores revelables, con "Te quedan X hoy y Y este mes" | US3, FR-014 |
| 6 | **Comenzar** (doble clic) | Una sola consumición (`select count(*) from simulation_consumptions where session_id = …` = 1); `m1` del cliente plantea la objeción visible | FR-018, FR-021 |
| 7 | Enviar mensajes; con proveedor falso usar `[[e2e:revelar:budget]]` | Streaming con "escribiendo…", termómetro con variación, "Presupuesto" desbloqueado con enlace al mensaje | US4 |
| 8 | Enviar `[[e2e:429]]` | "El cliente está tardando, reintentando…", luego respuesta; el mensaje no se duplica | FR-058 |
| 9 | Enviar `[[e2e:cortar-stream]]` | Texto parcial descartado, "Reintentar" en el mensaje; al reintentar, una sola respuesta | Edge cases, SC-009 |
| 10 | Cerrar la pestaña y volver desde Hoy | "Tienes una práctica en curso" → Retomar con transcripción, panel y borrador | FR-030 |
| 11 | Pedir pista dos veces en el mismo turno; tocar un chip | Una pista; segundo intento rechazado; el chip inserta texto editable sin enviar | FR-031 |
| 12 | **Terminar y evaluar** | Progreso "Leyendo la conversación → Evaluando criterios → Preparando tu reporte"; salir y volver; resultado | US6 |
| 13 | En el resultado activar una cita con Enter | Foco y resaltado en el mensaje; "Volver al criterio" | FR-047 |
| 14 | **Practicar de nuevo** | Nueva pantalla previa con el mismo producto (versión vigente), objeciones, dificultad, pistas y etapa foco | FR-048 |
| 15 | Con `[[e2e:eval-falla]]` en la conversación, terminar | "Evaluación fallida" + "Reintentar evaluación"; tras 3 reintentos fallidos, "no disponible" sin botón | FR-043 |
| 16 | **Historial**: filtrar por producto y fechas, copiar la URL en otra pestaña | Mismos filtros; gráfico con "Ver como tabla"; franja con etapa más débil | US8 |
| 17 | Superadmin fija cuota diaria = 0 para A; A abre Practicar y Hoy | Bloqueo con motivo, sin llamada de IA (`ai_usage` sin filas nuevas) | AC-07, SC-005 |
| 18 | Sesión activa: esperar 20 min (o en local `update practice_sessions set deadline_at = now() - interval '1 second' where id = …`) sin abrir la página | En ≤ 1 min la sesión queda `finalized/time_limit` y la evaluación se despacha sola | FR-028d, R8 |
| 19 | Vendedor B abre `/practicas/<id de A>` y `/productos/<id de A>` | "No encontrado" | AC-01 |

## Pruebas automatizadas

```bash
pnpm lint && pnpm typecheck
pnpm test                    # Vitest: dominio, prompts (lock de versiones), adaptador con mock, golden offline
pnpm db:test                 # pgTAP: guardián, aislamiento A/B, reglas de turno, cuota, evaluación, mantenimiento
pnpm test:e2e                # Playwright + axe con AI_PROVIDER=fake (móvil 360 y escritorio, ambos temas)
pnpm test:golden             # en vivo: requiere GOOGLE_GENERATIVE_AI_API_KEY; consume cuota gratuita
```

Resultado esperado: todo en verde; axe sin violaciones `serious`/`critical`; `test:golden` cumple
SC-003 (0 puntajes sobre el peso, 100 % de evidencias válidas) y SC-006 (100 % de inyecciones sin
romper personaje).

## Mediciones (en producción o con Gemini real)

- **SC-007** (primer fragmento < 2,5 s p95): `ai_usage.first_chunk_ms` (tiempo hasta el primer
  fragmento visible; `latency_ms` es el total de la llamada). Consulta: `select percentile_cont(0.95) within group (order by first_chunk_ms) from ai_usage where task = 'buyer' and outcome = 'success' and created_at > now() - interval '7 days';`
- **SC-008** (95 % de evaluaciones < 60 s): `ended_at` de la sesión vs. `created_at` de
  `practice_evaluations`.
- **SC-012**: `select organization_id, count(*) from simulation_consumptions group by 1, date_trunc('day', consumed_at)` nunca supera `quotas.daily_limit`.
- **SC-001 / SC-013**: protocolo de pruebas con usuarios de 001 (cronómetro, sin ayuda) con 5–8
  vendedores; registrar tiempo hasta el primer resultado y si identifican una mejora concreta.

## Operación en producción

1. `supabase db push` (migraciones de 002; la rúbrica v1.0 viaja en una migración, **nunca** se
   ejecuta `seed.sql` en producción).
2. `pnpm tsx scripts/ops/set-practice-dispatch.ts` → carga en Vault la URL de producción y el
   secreto del despachador (el mismo valor que `PRACTICE_DISPATCH_SECRET` en Vercel).
3. Variables en Vercel: `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_MODEL_*`, `PRACTICE_DISPATCH_SECRET`
   (`AI_PROVIDER` ausente o `google`).
4. Verificar `cron.job_run_details` de `practice-maintenance` y `net._http_response` (respuestas 202
   del despachador) tras el primer cierre por tiempo.
