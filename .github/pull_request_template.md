## Qué cambia

<!-- Resumen breve y enlace a la spec/tarea (p. ej. specs/001-platform-foundation/tasks.md → T123). -->

## Estados por pantalla

Para cada pantalla nueva o modificada:

- [ ] Vacío (mensaje que explica qué hacer)
- [ ] Carga (`loading.tsx` / esqueleto)
- [ ] Error (`error.tsx` con "Reintentar" e id de referencia, sin detalles internos)
- [ ] Sin permiso (403 que no revela si el recurso existe)
- [ ] Éxito (confirmación clara: toast o mensaje)

## Accesibilidad (WCAG 2.2 AA)

- [ ] axe sin violaciones `serious`/`critical` en claro y oscuro
- [ ] Navegable solo con teclado; foco visible y en orden lógico; el foco vuelve tras cerrar diálogos
- [ ] Objetivos táctiles ≥ 44 px; sin scroll horizontal a 360 px
- [ ] Errores junto al campo (`aria-invalid` + `aria-describedby`) sin perder lo escrito
- [ ] Contraste AA con tokens (sin colores ni valores literales)
- [ ] Respeta `prefers-reduced-motion`

## Seguridad y datos

- [ ] Guard en cada Server Action / página (rol y `aal`); la función SQL vuelve a verificar
- [ ] RLS y pruebas pgTAP para tablas o funciones nuevas
- [ ] Sin secretos ni PII en logs, auditoría o bundle (`pnpm check:bundle-secrets`)

## Evidencia de pruebas

- [ ] `pnpm lint && pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm supabase test db`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:golden` (dataset dorado offline; corre también en `unit`)
- [ ] Si cambian prompts, esquemas de IA o el dataset dorado: `golden.yml` en verde (Gemini real) y
      `pnpm prompts:lock` actualizado
- [ ] `pnpm lhci` (si cambia landing, `/iniciar-sesion`, `/inicio`, `/productos`, `/historial` o el
      resultado `/practicas/[id]`: Lighthouse en CI reemplaza la medición de Web Vitals del preview)

<!-- Pega aquí el resumen de resultados o enlaza los artefactos del CI. -->

## Capturas

Sin preview deployments (research.md §R22): las capturas son la evidencia visual de la revisión.

| Móvil (360 px)          | Escritorio              |
| ----------------------- | ----------------------- |
| <!-- claro / oscuro --> | <!-- claro / oscuro --> |
