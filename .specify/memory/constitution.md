# Constitución de Creando Valor IA™

Plataforma SaaS multiempresa de Cautiva Marketing / CautivaTech para entrenar vendedores
mediante tutor conversacional, roleplays con compradores simulados por IA, evaluación con
rúbricas, coaching y paneles de gerencia. La fuente de verdad del producto es
`docs/Creando_Valor_IA_Documento_Maestro_Programador.pdf` (en adelante, "documento maestro").
Las palabras DEBE, NUNCA y DEBERÍA tienen el sentido normativo de RFC 2119.

## Principios fundamentales

### I. Aislamiento multiempresa ante todo (NO NEGOCIABLE)

- Toda tabla de negocio DEBE tener columna `organization_id NOT NULL` con FK a
  `organizations` e índice (solo o como prefijo de un índice compuesto).
- Toda lectura o escritura DEBE verificar en el servidor la pertenencia del usuario a la
  organización y su autorización por rol (RBAC: `superadmin`, `admin_empresa`, `supervisor`,
  `instructor`, `vendedor`). NUNCA se confía en filtros, ids ni roles enviados por el navegador.
- Row Level Security de Supabase DEBE estar activado en TODAS las tablas del esquema expuesto,
  con políticas explícitas. RLS es defensa adicional, NUNCA la única: la autorización del
  backend existe aunque RLS también la cubra.
- La visibilidad jerárquica (p. ej., un supervisor ve solo a su equipo autorizado) se aplica en
  servidor y en BD, no solo en la UI (AC-08).
- Cada feature que cree o lea datos de negocio DEBE incluir pruebas automatizadas de
  aislamiento: pgTAP (políticas RLS y funciones) y e2e (Playwright) que demuestren que una
  organización no ve mensajes, documentos, evaluaciones ni métricas de otra (AC-01).

**Verificación**: prueba pgTAP que falla si alguna tabla de `public` no tiene RLS activado o si
una tabla de negocio carece de `organization_id` indexado; suites de aislamiento por feature en
CI.

**Razón**: una fuga entre empresas destruye la confianza del producto y es el riesgo principal
identificado en el documento maestro.

### II. Seguridad y privacidad por diseño (NO NEGOCIABLE)

- Los secretos viven solo en el servidor (variables de entorno de Vercel/Supabase). La
  `service_role` key y las API keys de IA NUNCA llegan al cliente ni a variables
  `NEXT_PUBLIC_*`; su uso se limita a módulos marcados `server-only`.
- Mínimo privilegio en roles de BD, claves y cuentas de servicio. MFA obligatorio para
  `superadmin` y `admin_empresa`.
- Las acciones sensibles (invitaciones, cambios de rol, cambios de rúbrica, exportaciones,
  eliminaciones, cambios de plan o cuotas) DEBEN registrarse en `audit_logs` con actor,
  organización, acción, objeto y marca de tiempo.
- Toda entrada externa (formularios, Server Actions, Route Handlers, webhooks, archivos) DEBE
  validarse con esquemas Zod en el servidor. Las rutas aplican rate limiting, idempotencia en
  operaciones sensibles y un formato de error consistente que no filtra detalles internos.
- Los webhooks DEBEN validar firma y prevenir replay.
- NUNCA se registran PII, contenido de conversaciones ni contenido de documentos en logs de
  observabilidad (Sentry, Vercel, consola); solo ids y metadatos técnicos.
- Mientras se use la capa gratuita de cualquier proveedor de IA (Gemini, Groq u otro), solo se
  procesan datos ficticios o con consentimiento explícito. Está PROHIBIDO cargar datos reales de
  clientes finales.
- Retención, exportación (AC-11) y eliminación de datos se rigen por una política escrita;
  soft-delete donde proceda, y la cancelación de un plan NUNCA provoca pérdida accidental de
  datos (AC-10).
- OWASP ASVS es la guía de revisión de seguridad.

**Verificación**: análisis en CI que falla si un secreto o la `service_role` aparece en el bundle
del cliente; pruebas de que los esquemas Zod rechazan entradas inválidas; revisión de que los
`beforeSend` de Sentry eliminan PII.

### III. IA responsable, trazable y reemplazable

- El LLM se invoca solo a través de un adaptador basado en Vercel AI SDK. Cambiar de Gemini a
  otro proveedor NO DEBE modificar la lógica de dominio. El modelo por tarea (tutor, comprador
  simulado, evaluador, embeddings) se configura por variable de entorno.
- Los prompts de sistema viven en el servidor, versionados, con límites de longitud y pruebas
  automáticas. Productos, catálogos, documentos y mensajes del usuario son datos NO confiables:
  se delimitan explícitamente y NUNCA se tratan como instrucciones; una instrucción inyectada no
  modifica las políticas del agente (AC-09).
- El tutor DEBE indicar cuando el catálogo no contiene un dato (p. ej., un precio) en lugar de
  inventarlo (AC-05).
- Las salidas estructuradas (evaluaciones, metadatos de turno) DEBEN validarse con esquemas
  Zod; si no validan, se reintenta un número acotado de veces y luego se falla de forma
  controlada y visible.
- El evaluador NUNCA supera el peso máximo de un criterio, solo cita ids de mensajes existentes
  de la sesión, no inventa conductas y marca `no_evaluable` cuando falta evidencia (AC-04).
  Toda evaluación guarda la versión de rúbrica y de prompt usadas.
- Cada llamada a IA registra organización, usuario, tarea, modelo, tokens de entrada y salida,
  latencia y costo estimado. Las cuotas se verifican ANTES de invocar el modelo y, si se agotan,
  se bloquean nuevas sesiones con un mensaje explicativo (AC-07).
- Venta ética: contenidos y agentes NUNCA promueven escasez falsa, engaño, coerción ni
  promesas no verificables (p. ej., valorización futura). Solo se usan materiales propios o
  licenciados; las metodologías de terceros se explican con redacción original.
- La evaluación automatizada es orientativa y NUNCA la única base para decisiones laborales;
  la UI lo indica con un aviso visible.

**Verificación**: pruebas unitarias del adaptador con proveedor simulado; pruebas de
validación post-modelo del evaluador (pesos, ids citados); casos de prompt injection en el
dataset dorado; prueba de que una cuota agotada impide la llamada al modelo.

### IV. UX/UI de excelencia

- Mobile-first y responsive desde 360 px. Objetivo WCAG 2.2 AA: navegación completa por
  teclado, foco visible, contraste AA, objetivos táctiles de 44 px o más, `aria-live` en los
  chats y respeto de `prefers-reduced-motion` (AC-12).
- Un único design system basado en tokens (colores semánticos, tipografía, espaciado, radios,
  sombras, motion) con modo claro y oscuro. Identidad base: tinta verde `#0E5A4A`, acento ají
  `#E89A0C`, papel `#F3F5F1`; Bricolage Grotesque para títulos y Figtree para texto, cargadas
  con `next/font`. Está PROHIBIDO estilizar fuera del sistema de tokens (sin colores, tamaños ni
  sombras literales en componentes).
- Toda pantalla DEBE definir los estados vacío, carga (skeleton), error recuperable, sin permiso
  y éxito. Las respuestas de IA se muestran en streaming con indicador de progreso.
- Microcopy en español neutro-peruano, claro y en segunda persona. Moneda en formato `S/` y
  fechas en la zona horaria de la organización. Aviso visible de uso de IA.
- Presupuesto de rendimiento en móvil 4G: p95 menor a 3 s en páginas principales, LCP menor a
  2,5 s y CLS menor a 0,1.

**Verificación**: Playwright + axe sin violaciones serias o críticas en viewports móvil y
escritorio; regla de lint que prohíbe colores literales fuera de los tokens; checklist de
estados por pantalla en el PR; medición de Web Vitals en el preview.

### V. Calidad verificable

- Cada historia de usuario tiene criterios de aceptación verificables, mapeados a los AC-xx del
  documento maestro cuando aplique.
- Pirámide de pruebas obligatoria:
  - Vitest para unidad y dominio.
  - pgTAP para RLS, políticas y funciones de BD.
  - Playwright + axe para flujos e2e y accesibilidad en móvil y escritorio.
  - Dataset dorado de conversaciones para la regresión del evaluador y los agentes.
- CI en GitHub Actions bloquea el merge si fallan lint, typecheck, pruebas unitarias, e2e o
  pruebas de BD. Cada PR genera un preview en Vercel.
- NUNCA se declara cumplido un requisito (seguridad, rendimiento, resiliencia) sin una prueba o
  medición que lo respalde.

**Verificación**: reglas de protección de rama en `main` con checks obligatorios; trazabilidad
historia → AC → prueba en `tasks.md`.

### VI. Simplicidad y alcance cerrado por etapa

- MVP cerrado: se construye solo lo que especifica la etapa en curso (YAGNI). Toda ampliación
  pasa por control de cambios en la spec antes de implementarse.
- Herramientas gratuitas por defecto. Agregar una dependencia o un servicio de pago requiere
  justificación explícita en el plan (necesidad, alternativa gratuita descartada y costo).
- Se prefieren capacidades nativas de Next.js y Supabase antes que nuevas piezas de
  infraestructura (colas, caches o servicios externos).

**Verificación**: el "Constitution Check" del plan lista cada dependencia nueva con su
justificación; `/speckit-analyze` señala tareas sin requisito que las origine.

### VII. Versionado, migraciones y auditoría

- Rúbricas, escenarios, prompts y contenidos se versionan. Los registros históricos
  (sesiones, evaluaciones, certificados) conservan la versión usada; modificar una rúbrica
  NUNCA altera evaluaciones pasadas (AC-06).
- El esquema cambia solo mediante migraciones reproducibles de Supabase CLI, versionadas en el
  repositorio, con seed de desarrollo y plan de rollback documentado. NUNCA se modifica el
  esquema a mano en staging ni en producción.

**Verificación**: `supabase db reset` reconstruye el entorno local desde cero en CI; pruebas de
que las evaluaciones referencian `rubric_version` y `prompt_version` inmutables.

## Restricciones técnicas

Este stack prevalece sobre el "stack sugerido" del documento maestro (§16). Desviarse de él
requiere una enmienda o una justificación aprobada en el "Constitution Check" del plan.

- **Aplicación**: Next.js (App Router) + React + TypeScript en modo `strict`. Server
  Components por defecto, Server Actions para mutaciones y Route Handlers para streaming y
  webhooks.
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix) personalizado con tokens; lucide-react para
  iconos; Motion para animaciones; `next/font` para tipografías.
- **Datos**: Supabase (Postgres, RLS, pgvector, Auth con invitaciones, Storage) vía
  `@supabase/ssr`. Entornos aislados: local (`supabase start`), staging y producción.
- **IA**: Vercel AI SDK con Google Gemini y Groq (capas gratuitas durante el piloto), en una
  cadena por tarea con failover ante 429/5xx, configurada por variable de entorno e
  intercambiable por adaptador. Cada modelo de la cadena DEBE pasar el dataset dorado de su
  tarea antes de usarse.
- **Correo transaccional**: Resend como SMTP de Supabase Auth.
- **Despliegue**: Vercel (preview por PR, producción desde `main`). SiteGround solo para
  dominio, DNS y correo.
- **Observabilidad**: Sentry y Vercel Analytics, más una tabla propia de uso y costos de IA.
- **Idioma**: código, identificadores y commits en inglés (Conventional Commits); UI, specs y
  documentación en español.

## Flujo de desarrollo y puertas de calidad

- Spec-Driven Development con Spec Kit por etapas: `specify` → `clarify` → `plan` → `tasks` →
  `analyze` → `implement`. No se implementa sin spec y plan aprobados.
- Una rama por feature. Cada PR incluye checklist de accesibilidad y evidencia de pruebas
  (resultados de CI, Lighthouse y, en cambios de UI, capturas móvil y escritorio). No hay preview
  de Vercel: existe un único entorno de producción y una preview no tendría base de datos.
- `main` está siempre desplegable; los merges solo ocurren con CI en verde.
- El plan de cada feature incluye un "Constitution Check" que recorre los principios I–VII y
  justifica explícitamente cualquier desviación, con su alternativa descartada.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica, guía o preferencia del proyecto.
  Ante un conflicto con el documento maestro en materia de proceso o tecnología, rige la
  constitución; en materia de producto, rige el documento maestro.
- Las enmiendas requieren: justificación escrita, actualización de este archivo, nuevo número
  de versión, fecha de enmienda y plan de migración para el trabajo en curso que se vea
  afectado.
- Versionado semántico:
  - MAJOR: eliminación o redefinición incompatible de un principio o regla de gobernanza.
  - MINOR: principio o sección nuevos, o ampliación material de una regla.
  - PATCH: aclaraciones, redacción o correcciones sin cambio semántico.
- El cumplimiento se revisa en cada `/speckit-analyze` y en la revisión de cada PR. Una
  violación de un principio NO NEGOCIABLE (I, II) bloquea el merge sin excepción; el resto solo
  admite desviaciones justificadas en el "Constitution Check".

### Historial de enmiendas

- **1.1.0 (2026-11-25)**:
  - **Proveedores de IA:** se añade Groq junto a Gemini, con una cadena de failover por tarea.
    - Justificación: la capa gratuita de Gemini permite 20 solicitudes por día y por modelo, y
      devuelve 503 frecuentes (002 research.md §R16). El piloto se mantiene en capas gratuitas.
    - Migración: 002 configura las cadenas en `AI_MODEL_*`.
  - **Datos ficticios:** la regla se amplía a la capa gratuita de cualquier proveedor.
  - **Previews:** se elimina la exigencia de preview de Vercel por PR, en línea con la decisión
    de un único entorno (001 research.md §R22). Lighthouse en CI y las capturas la sustituyen.

**Version**: 1.1.0 | **Ratified**: 2026-11-23 | **Last Amended**: 2026-11-25
