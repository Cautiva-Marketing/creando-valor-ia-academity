# Creando Valor IA™ · Decisiones, hoja de ruta y borradores

> **Estado (2026-11-25)**: etapa 1 implementada. `001-platform-foundation` está en producción y
> `002-seller-practice` está en el PR, pendiente de salir a producción. Las decisiones de abajo
> reflejan lo vigente; donde cambiaron se indica.

## Decisiones tomadas (con el usuario)
| Tema | Decisión |
|---|---|
| Hosting | **Next.js en Vercel**: **solo producción**, desplegada desde `main`. Las preview deployments están deshabilitadas porque no tendrían base de datos y nunca deben apuntar a la de producción. La validación antes del merge es local + CI: Lighthouse y capturas sustituyen al preview (research 001 §R22). SiteGround queda para dominio, DNS y correo (no ejecuta Node). ⚠️ El plan Hobby de Vercel no permite uso comercial: pasar a Pro antes de cobrar a clientes. |
| BD/Backend | **Supabase**: Postgres + RLS + pgvector + Auth + Storage. Calza con el modelo de datos del doc, que es relacional y usa embeddings. **Un único proyecto de producción, sin staging.** El desarrollo y el CI usan el stack local (`supabase start`) con `seed.sql`, que **nunca** se ejecuta en producción. Las migraciones llegan a producción con `supabase db push`, solo con aprobación explícita. |
| IA | **Gemini + Groq** detrás de un adaptador (`src/lib/ai/`), con Vercel AI SDK, en una cadena por tarea con failover ante 429/5xx (`AI_MODEL_*`). Hay un proveedor falso determinista para pruebas. **El piloto usa solo capas gratuitas** (decisión del 2026-11-25, constitución v1.1.0). En 002 (T003) se midió que la de Gemini sola no alcanza: 20 solicitudes al día por modelo y 503 frecuentes; Groq aporta unas 1.000 al día por modelo. ⚠️ Solo datos ficticios en cualquier capa gratuita; pasar a pago antes de abrir a clientes reales. Modelos: Gemini 3.x con `thinkingLevel` y `openai/gpt-oss-120b` en Groq. Cada feature con IA nueva (tutor, coach) necesita su dataset dorado por modelo de la cadena y su bloqueo de prompts, como en 002. |
| Acceso | **Solo por invitación**: el superadmin invita, el usuario fija su contraseña y se crea su organización personal. |
| Multiempresa | El modelo completo va en BD desde la etapa 1 (organizations, memberships, roles, RLS y pruebas de aislamiento). La UI de la etapa 1 solo usa la organización personal. |
| Objeción oculta | El sistema sortea cuál objeción es visible y cuál oculta. Si el vendedor registró solo una, la IA genera la oculta. |
| Producto | Sector elegido de una lista del doc (+ "otro") y producto libre. La IA genera el comprador con perfil oculto: presupuesto, plazo y quién decide. |
| Marca | Se refina la identidad del prototipo, con tokens, modo claro/oscuro y motion. Se ajusta cuando llegue el brandbook. |

## Stack (todo con capa gratuita durante el piloto)
Next.js (App Router, versión estable vigente) + React + TypeScript strict · Tailwind CSS v4 + shadcn/ui (Radix) con tokens propios · lucide-react · Motion · next/font · Zod + React Hook Form · `@supabase/ssr` · Supabase CLI (migraciones, seeds, pgTAP) · Vercel AI SDK v6 (`streamText` / `generateText` con `Output.object`) · Resend como SMTP de Supabase Auth (las invitaciones necesitan SMTP propio) · Vitest + Testing Library · Playwright + `@axe-core/playwright` · GitHub Actions (lint, typecheck, tests, db tests) · Sentry (plan Developer) · Vercel Analytics. Cuotas y consumo de IA en tablas Postgres, sin Redis por ahora.

## Hoja de ruta por etapas (features de Spec Kit)
| Etapa | Spec | Alcance |
|---|---|---|
| **1** ✅ | `001-platform-foundation` | Design system, app shell, auth por invitación, org personal, modelo multiempresa + RLS, consola mínima del superadmin para invitaciones y cuotas, auditoría, landing con "solicitar acceso" |
| **1** ✅ | `002-seller-practice` | Productos y objeciones, configuración de la práctica, simulación con IA, evaluación con rúbrica v1.0 (JSON del Anexo A), resultado con evidencias, historial, inicio "Hoy" |
| 2 | `003-empresas-equipos` | Empresas, invitaciones del admin, roles, equipos, panel de supervisor, asignaciones, revisión humana y comentarios |
| 3 | `004-academia-tutor` | Cursos, módulos y lecciones versionados; diagnóstico y ruta; quiz; documentos + RAG; tutor con citas |
| 4 | `005-escenarios-coaching` | Biblioteca curada de escenarios por sector, editor de rúbricas versionadas, agente coach, insignias |
| 5 | `006-planes-cobro-gobierno` | Planes, cuotas, pasarela local, consola del superadmin, certificados, exportación y eliminación de datos, costos |
| 6 | `007-sitio-publico-piloto` | Sitio público completo, páginas legales, hardening OWASP ASVS, rendimiento, manuales |

Flujo por spec: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.

Al especificar cada etapa, heredar lo que ya existe y no redefinirlo:

- **De 001**: organizaciones, membresías, roles, RLS, auditoría, cuotas y consumo, y el design
  system.
- **De 002**: productos versionados, sesiones, evaluaciones con rúbrica v1.0, `ai_usage`, el
  despachador `pg_cron` + Vault y el dataset dorado.

Ejemplos:

- **003** extiende la propiedad de productos y prácticas del vendedor a la empresa y el equipo, y la
  revisión humana se apoya en `practice_evaluations`.
- **005** versiona la rúbrica existente; no crea otra.

## Borradores de prompts para etapas 2–6 (se afinan al cerrar la etapa 1)
- **003-empresas-equipos:** crear empresa (US-01) con marca, sector y zona horaria; el admin invita usuarios con rol y equipo (US-02); equipos con supervisor; el supervisor asigna prácticas con fecha límite y revisa evolución por competencia (US-08); revisión humana de evaluaciones con comentarios ("Solicitar revisión"); panel de equipo con KPIs, tabla de personas, promedio por etapa C.A.U.T.I.V.A.™ y detalle por persona; el gerente solo ve a su equipo (AC-08); productos y escenarios compartidos por la empresa.
- **004-academia-tutor:** cursos, módulos y lecciones versionados con la plantilla del doc §5 (US-03); diagnóstico inicial y ruta (US-04); quiz por lección; subida de documentos de la empresa con chunking + embeddings en pgvector y aislamiento por tenant (US-09); tutor con citas que reconoce cuando un dato no está en los documentos (US-05, AC-05); defensa contra archivos maliciosos (AC-09).
- **005-escenarios-coaching:** biblioteca curada por sector (3 básicos, 4 intermedios y 3 avanzados) con ficha, datos revelables, condiciones de éxito y transcripción de referencia; editor de rúbricas versionadas en el que las evaluaciones antiguas conservan su versión (AC-06); agente coach basado en las 2 últimas evaluaciones y la meta, con ejercicio de 10 minutos y fecha de revisión; insignias.
- **006-planes-cobro-gobierno:** planes Emprendedor, Equipo, Empresa y Corporativo (US-10) con cuotas; pasarela local (Mercado Pago o Culqi, a decidir) con webhooks firmados y anti-replay; política de cancelación (AC-10); consola del superadmin (tenants, versiones de prompts, costos, incidencias); certificados verificables (US-11); exportación y eliminación de datos (US-12, AC-11).
- **007-sitio-publico-piloto:** sitio público completo (producto, casos por sector, planes, demo, contacto, políticas); hardening OWASP ASVS, pruebas de carga, respaldos y restauración probada, manuales de administrador, instructor y alumno; onboarding de 3 a 5 empresas piloto.

## Verificación
- Revisar que cada prompt cubra las US y AC del doc correspondientes a su etapa. Mapeo: 001 cubre US-02 parcial, AC-01, AC-02 y AC-12; 002 cubre US-06, US-07, AC-03, AC-04, AC-07 y AC-09.
- Tras `/speckit-constitution`: `.specify/memory/constitution.md` sin placeholders y con versión 1.0.0.
- Tras cada `/speckit-specify`: correr `/speckit-clarify` y luego `/speckit-analyze` después de `/speckit-tasks` para detectar inconsistencias con la constitución.
