# Prompt · /speckit-constitution

> Uso: copia el bloque y pégalo después del comando indicado en Claude Code.

```text
Crea la constitución de "Creando Valor IA™" (Cautiva Marketing / CautivaTech), plataforma SaaS multiempresa para entrenar vendedores mediante tutor conversacional, roleplays con compradores simulados por IA, evaluación con rúbricas, coaching y paneles de gerencia. Fuente de verdad del producto: docs/Creando_Valor_IA_Documento_Maestro_Programador.pdf. Escribe la constitución en español.

PRINCIPIOS (no negociables, con reglas verificables):

I. Aislamiento multiempresa ante todo
- Toda tabla de negocio lleva organization_id con índice y FK; toda lectura o escritura exige pertenencia al tenant y autorización en el servidor (RBAC: superadmin, admin_empresa, supervisor, instructor, vendedor). Nunca se confía en filtros del navegador.
- Row Level Security de Supabase activado en TODAS las tablas como defensa adicional, nunca como única defensa.
- Cada feature incluye pruebas automatizadas de aislamiento (pgTAP + e2e) que demuestran que una organización no ve mensajes, documentos, evaluaciones ni métricas de otra.

II. Seguridad y privacidad por diseño
- Secretos solo en el servidor (variables de entorno de Vercel/Supabase); la service_role key nunca llega al cliente.
- Mínimo privilegio, MFA para superadmin y administradores, auditoría (audit_logs) de acciones sensibles, validación Zod de toda entrada, rate limiting y errores consistentes. Revisión con OWASP ASVS como guía.
- No registrar PII ni contenido de conversaciones en logs de observabilidad.
- Mientras se use la capa gratuita de Gemini, solo se procesan datos ficticios o con consentimiento explícito; está prohibido cargar datos reales de clientes finales.
- Retención, exportación y eliminación de datos definidas por política; soft-delete donde proceda.

III. IA responsable, trazable y reemplazable
- El proveedor de LLM se usa detrás de un adaptador (Vercel AI SDK); cambiar de Gemini a otro proveedor no debe tocar la lógica de dominio. El modelo por tarea se configura por variable de entorno.
- Los prompts de sistema viven en el servidor, versionados, con límites de longitud y pruebas automáticas. Productos, documentos y mensajes del usuario son datos NO confiables: se delimitan y nunca se tratan como instrucciones (defensa contra prompt injection).
- Las salidas estructuradas (evaluaciones, metadatos de turno) se validan con esquemas Zod; si no validan, se reintenta o se falla de forma controlada.
- El evaluador nunca supera el peso máximo de un criterio, solo cita ids de mensajes existentes, no inventa conductas y marca no_evaluable cuando falta evidencia. Toda evaluación guarda la versión de rúbrica y de prompt usadas.
- Cada llamada a IA registra organización, usuario, tarea, modelo, tokens, latencia y costo estimado; las cuotas se verifican ANTES de invocar el modelo.
- Venta ética: el contenido y los agentes no promueven escasez falsa, engaño ni coerción. La evaluación automatizada es orientativa y nunca la única base para decisiones laborales (aviso visible).

IV. UX/UI de excelencia
- Diseño mobile-first y responsive (desde 360 px), objetivo WCAG 2.2 AA: navegación completa por teclado, foco visible, contraste AA, objetivos táctiles de 44 px o más, aria-live en chats, soporte de prefers-reduced-motion.
- Design system único basado en tokens (colores semánticos, tipografía, espaciado, radios, sombras, motion) con modo claro y oscuro. Identidad base: tinta verde #0E5A4A, acento ají #E89A0C, papel #F3F5F1, tipografías Bricolage Grotesque (títulos) y Figtree (texto). Prohibido estilizar fuera del sistema de tokens.
- Toda pantalla define estados vacío, carga (skeleton), error recuperable, sin permiso y éxito. Las respuestas de IA se muestran en streaming con indicador de progreso.
- Microcopy en español neutro-peruano, claro y en segunda persona; formato de moneda S/ y fechas con la zona horaria de la organización. Aviso visible de uso de IA.
- Presupuesto de rendimiento: p95 menor a 3 s en páginas principales, LCP menor a 2,5 s, CLS menor a 0,1 en móvil 4G.

V. Calidad verificable
- Cada historia de usuario tiene criterios de aceptación verificables, mapeados a los AC-xx del documento maestro cuando aplique.
- Pruebas: Vitest (unidad y dominio), pgTAP (RLS y funciones de BD), Playwright + axe (flujos e2e y accesibilidad en móvil y escritorio), y un dataset dorado de conversaciones para regresión del evaluador.
- CI en GitHub Actions bloquea el merge si fallan lint, typecheck, pruebas o pruebas de BD. Cada PR genera un preview en Vercel.

VI. Simplicidad y alcance cerrado por etapa
- MVP cerrado: se construye solo lo que la etapa especifica (YAGNI); cualquier ampliación pasa por control de cambios en la spec.
- Herramientas gratuitas por defecto; agregar una dependencia o servicio de pago requiere justificación en el plan.
- Preferir capacidades nativas de Next.js y Supabase antes que nuevas piezas de infraestructura.

VII. Versionado, migraciones y auditoría
- Rúbricas, escenarios, prompts y contenidos se versionan; los registros históricos conservan la versión usada.
- El esquema cambia solo mediante migraciones de Supabase CLI reproducibles, con seed de desarrollo y plan de rollback.

RESTRICCIONES TÉCNICAS:
- Frontend y backend: Next.js (App Router) + React + TypeScript strict, Server Components, Server Actions y Route Handlers para streaming. Tailwind CSS v4 + shadcn/ui (Radix) personalizado con tokens; lucide-react; Motion; next/font.
- Datos: Supabase (Postgres, RLS, pgvector, Auth con invitaciones, Storage) vía @supabase/ssr. Entornos: local (supabase start), staging y producción aislados.
- IA: Vercel AI SDK con proveedor Google Gemini (capa gratuita) intercambiable.
- Correo transaccional: Resend como SMTP de Supabase Auth.
- Despliegue: Vercel (preview por PR, producción desde main). SiteGround solo para dominio, DNS y correo.
- Observabilidad: Sentry y Vercel Analytics, más una tabla propia de uso y costos de IA.
- Código, identificadores y commits en inglés (Conventional Commits); UI, specs y documentación en español.

FLUJO DE DESARROLLO:
- Spec-Driven Development con Spec Kit por etapas: specify → clarify → plan → tasks → analyze → implement.
- Una rama por feature; PR con preview de Vercel, checklist de accesibilidad y evidencia de pruebas; main siempre desplegable.
- El plan de cada feature incluye un "Constitution Check" que justifica explícitamente cualquier desviación.

GOBERNANZA: la constitución prevalece sobre otras prácticas. Las enmiendas requieren justificación, versión semántica (iniciar en 1.0.0), fecha y plan de migración. Revisar el cumplimiento en cada /speckit-analyze.
```
