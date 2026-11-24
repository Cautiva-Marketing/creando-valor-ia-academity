# Quickstart: validación de la fundación de la plataforma

**Feature**: `001-platform-foundation` | Guía para comprobar de punta a punta que la feature funciona.
Detalle de rutas, acciones y funciones en [contracts/](./contracts/); modelo en
[data-model.md](./data-model.md).

## Prerrequisitos

- Node.js 24 LTS y pnpm; Docker Desktop en ejecución; Supabase CLI (dependencia de desarrollo).
- Una app autenticadora TOTP (o el secreto TOTP del superadmin sembrado con factor, para pruebas automatizadas).
- `.env.local` creado a partir de `.env.example` (valores locales que imprime `supabase status`):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, `SEND_EMAIL_HOOK_SECRET`, `SEND_EMAIL_HOOK_URI`,
  `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, `EMAIL_FROM`, `RATE_LIMIT_PEPPER`.

## Puesta en marcha

```bash
pnpm install
pnpm supabase start          # Postgres, Auth, Mailpit (http://127.0.0.1:54324)
pnpm supabase db reset       # aplica migraciones + seed (docs legales, superadmins con y sin factor, orgs A–E)
pnpm dev                     # http://localhost:3000
```

Esperado: `db reset` termina sin errores; la landing carga en `/`.

## Pruebas automatizadas (todas deben pasar)

```bash
pnpm lint && pnpm typecheck      # incluye regla contra colores/valores literales
pnpm test                        # Vitest: Zod, política de contraseñas, iniciales, formato, contraste AA de tokens, correos
pnpm supabase test db            # pgTAP: RLS en todas las tablas, aislamiento A/B, aal2, auditoría inmutable, accept_invitation, retención, sesión
pnpm build && pnpm check:bundle-secrets   # ningún secreto en .next/static
pnpm test:e2e                    # Playwright + axe: mobile-360 y desktop × claro y oscuro
pnpm lhci                        # Lighthouse móvil: landing, /iniciar-sesion, /inicio
```

## Escenarios manuales de validación

Usar Mailpit (`http://127.0.0.1:54324`) para leer los correos.

| # | Escenario | Pasos | Resultado esperado | Cubre |
|---|---|---|---|---|
| 1 | MFA obligatorio | Iniciar sesión con el superadmin sembrado **sin factor** (ver `tests/e2e/fixtures/seed-data.ts`) | Solo `/mfa/registrar` y cerrar sesión; abrir `/admin/invitaciones` redirige al registro | H4, SC-005 |
| 2 | MFA verificado | Registrar factor con QR, cerrar sesión, volver a entrar | Se pide código; tras verificar llega a `/admin/invitaciones`; 2 filas `superadmin.login` en `audit_logs` | H4, FR-027 |
| 3 | Invitar | Crear invitación a `ana@ejemplo.pe` (7 días) | Correo con marca, HTML + texto, vence en 7 días; listado "pendiente" | H1, SC-001 |
| 4 | Duplicado | Invitar `  Ana@Ejemplo.pe ` | Rechazo claro con opción "Reenviar" | H1-5, edge case |
| 5 | Reenviar / revocar | Reenviar con doble clic en la confirmación; abrir enlace viejo; revocar (doble clic); abrir enlace nuevo | Un solo correo nuevo; enlace viejo y revocado muestran mensaje AC-02; exactamente un `resent` y un `revoked` en la auditoría | H1-2/3, SC-003, SC-010 |
| 6 | Activar | Nueva invitación → abrir enlace a 360 px → contraseña débil, luego válida, aceptar términos e IA | Indicador de requisitos; cuenta creada, llega a `/onboarding`; existe org personal con pertenencia `{vendedor}`, cuota 10/100 y `invitation.accepted` | H2, FR-016 |
| 7 | Enlace usado | Abrir de nuevo el enlace activado | "Invitación ya usada" + "Iniciar sesión" | H2-6 |
| 8 | Sesión y recuperación | Cerrar navegador y volver; cerrar sesión; recuperar contraseña con correo existente e inexistente | Sesión persiste; tras cerrar sesión las rutas privadas redirigen; misma confirmación en ambos casos; un solo correo (existente) válido 60 min | H3 |
| 9 | Bloqueo | 5 contraseñas incorrectas seguidas | Mensaje con minutos para reintentar; el 6.º intento correcto también se frena | FR-023 |
| 10 | Registro abierto | Llamar a la API de Auth `signUp` con la clave publicable | Rechazado (signups deshabilitados) | FR-022 |
| 11 | App shell | Recorrer con teclado a 360 px y escritorio; cambiar tema y recargar | Skip link, foco visible, menús con Escape; sin parpadeo de tema; "sistema" sigue al SO | H5 |
| 12 | `/design` | Abrir como superadmin y como vendedor | Tokens y componentes en claro/oscuro con estados; vendedor ve "sin permiso" | H6, SC-012 |
| 13 | Cuotas | Editar cuota de org A a 5/3 y luego a 3/50 | Error junto al campo diario; luego guardado + `quota.updated` con antes/después | H7-2/3 |
| 14 | Suspender | Suspender org A con motivo, con el vendedor A con sesión abierta | Siguiente acción del vendedor A → `/acceso-suspendido`; reactivar devuelve el acceso | H7-7/8, FR-024 |
| 15 | Consumo | Abrir `/admin/consumo` (mes actual, mes anterior, rango) | Datos sembrados por org y totales en US$; sin ninguna vía a contenido | H7-4/6, SC-011 |
| 16 | Onboarding | Vendedor nuevo: avanzar a paso 2, salir y volver; saltar; reabrir desde menú | Retoma en paso 2; tras saltar llega a `/inicio` y puede retomarlo | H8 |
| 17 | Perfil | Cambiar nombre a "Ñandú" y zona a `America/Bogota` | Iniciales "Ñ"; fechas en la nueva zona | H9 |
| 18 | Solicitar acceso | Enviar desde 360 px; enviar 4 veces más | Confirmación; el 4.º envío de la hora se frena; sin duplicados; aparece en bandeja con contador; "Convertir en invitación" precarga el correo y marca "invitada" | H10 |
| 19 | Aislamiento | Con sesión del vendedor A, pedir por REST (`/rest/v1/quotas?organization_id=eq.<B>`) y por la UI con ids de B | Respuesta vacía / "no encontrado"; cero filas de B | AC-01, SC-004 |
| 20 | Retención | `select private.run_access_request_retention();` tras mover fechas de solicitudes sembradas | `new` de > 180 días → descartadas (auditoría `system`); descartadas > 90 días → anonimizadas | FR-049a |

## Pruebas con usuarios (SC-001, SC-002, SC-011)

Fuera de CI, en producción antes de abrir el acceso (cuentas de prueba suspendidas al terminar),
con cronómetro (T184). Resultados (tiempos individuales, mediana, % de
éxito y observaciones) registrados en el PR.

| Criterio | Participantes | Tarea | Medición | Umbral |
|---|---|---|---|---|
| SC-002 | ≥ 10 personas invitadas de prueba (no del equipo técnico) | Abrir el correo de invitación y activar la cuenta sin ayuda | Tiempo desde abrir el enlace hasta llegar a `/onboarding`; éxito al primer intento sin ayuda | < 3 min y ≥ 90 % al primer intento |
| SC-001 | Superadmin, 5 repeticiones | Crear y enviar una invitación desde `/admin/invitaciones` | Tiempo desde abrir el listado hasta la confirmación | < 1 min en cada repetición |
| SC-011 | Superadmin, 5 repeticiones (organización distinta cada vez, indicada al empezar) | Localizar el consumo de IA y la cuota de esa organización | Tiempo desde la pantalla de inicio hasta leer ambos valores | < 30 s en cada repetición |

Antes de empezar: invitaciones de prueba creadas, sin explicaciones previas a los participantes; si
alguien pide ayuda o abandona, cuenta como fallo del primer intento.

## Reset de MFA (procedimiento operativo)

```bash
pnpm tsx scripts/ops/reset-superadmin-mfa.ts --email <superadmin> --operator "<nombre del operador>"
```

Esperado: factor eliminado, sesiones de esa cuenta cerradas, fila `superadmin.mfa_reset` con
`actor_type = operator`; el siguiente inicio de sesión exige registrar un factor nuevo (escenario 1).

## Criterios de salida

- Todas las suites automatizadas en verde en CI (lint, typecheck, unit, db, bundle-secrets, e2e,
  lighthouse).
- Escenarios 1–20 verificados en local y en producción antes de abrir el acceso (los correos, en una bandeja
  real con Resend, revisados en Gmail/Outlook/Apple Mail en claro y oscuro).
- Pruebas con usuarios (SC-001, SC-002, SC-011) dentro de sus umbrales, con resultados en el PR.
