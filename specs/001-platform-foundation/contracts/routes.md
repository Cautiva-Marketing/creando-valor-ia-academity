# Contrato: rutas de la UI

Todas las rutas: 360 px sin scroll horizontal, operables solo con teclado, estados vacío / carga
(skeleton) / error recuperable / sin permiso / éxito según aplique (FR-039). El acceso se decide en
servidor con `getRequestContext()`; `proxy.ts` solo hace redirecciones optimistas y refresca la sesión.

Leyenda de acceso: **P** pública · **A** sin sesión (si hay sesión válida → redirige al destino del
usuario) · **V** vendedor con pertenencia operativa · **S1** superadmin con `aal1` · **S2** superadmin
con `aal2`.

## Públicas y autenticación

| Ruta | Acceso | Contenido / comportamiento | Historia / FR |
|---|---|---|---|
| `/` | P | Landing: propuesta, cómo funciona, aviso IA, "Solicitar acceso", "Iniciar sesión", enlaces legales | H10, FR-047 |
| `/solicitar-acceso` | P | Formulario (nombre, correo, empresa/ocupación, mensaje ≤ 500, privacidad); confirmación | H10, FR-048 |
| `/terminos`, `/privacidad`, `/aviso-ia` | P | Documento legal vigente con versión y fecha; marca "Borrador" si `is_draft` | FR-015, FR-047 |
| `/iniciar-sesion` | A | Correo + contraseña; error genérico; bloqueo con tiempo de reintento; acepta `?next=` (solo rutas internas) | H3, FR-018, FR-023 |
| `/recuperar-contrasena` | A | Correo → confirmación genérica siempre igual | H3, FR-020 |
| `/auth/confirm` | P (route handler) | Query validada con Zod (`authConfirmParams`: `token_hash`, `type = recovery`, `next` interno) → `verifyOtp(token_hash, type=recovery)` → `/restablecer-contrasena`; parámetros inválidos o enlace inválido/vencido → `/recuperar-contrasena?estado=enlace-invalido` | FR-020 |
| `/restablecer-contrasena` | sesión de recuperación | Nueva contraseña con indicador de requisitos; al guardar cierra las demás sesiones | FR-020, FR-021 |
| `/invitacion/[token]` | P | `[token]` se valida con Zod (`invitationTokenParam`, 43 caracteres base64url) antes de cualquier consulta; si no valida → mensaje de enlace manipulado/inexistente. Válida: correo (solo lectura), nombre, contraseña, términos, aviso IA. Inválida: mensaje según causa (vencida, revocada, ya usada → "Iniciar sesión", manipulada/inexistente → genérico) y cómo pedir otra | H2, FR-011, FR-014–017 |
| `/mfa/registrar` | S1 sin factor | QR + clave manual + verificación; única salida: cerrar sesión | H4, FR-025 |
| `/mfa/verificar` | S1 con factor | Código TOTP; bloqueo tras 5 fallos | H4, FR-023, FR-025 |
| `/acceso-suspendido` | sesión sin pertenencia operativa | Mensaje explicativo + contacto + cerrar sesión | FR-024 |

## App (app shell común, FR-037)

| Ruta | Acceso | Contenido | Historia / FR |
|---|---|---|---|
| `/inicio` | V | Saludo, aviso "La práctica llega pronto", retomar onboarding si `skipped`/`in_progress` | H8 |
| `/onboarding` | V | 3 pasos con "Paso n de 3", Saltar, Siguiente/Anterior; retoma en `onboarding_step` | H8, FR-034 |
| `/perfil` | V, S2 | Nombre, zona horaria (combobox con buscador), avatar con iniciales, correo y fechas de aceptación (solo lectura) | H9, FR-035–036 |
| `/admin` | S2 | Redirige a `/admin/invitaciones` | — |
| `/admin/invitaciones` | S2 | Tabla/lista: correo, estado, vence, último envío, envío fallido; filtros por estado, búsqueda por correo; reenviar, revocar, reintentar envío; paginación de 20 | H1, FR-009, FR-013 |
| `/admin/invitaciones/nueva` | S2 | Correo, plazo 1–30 (7); `?solicitud={id}` (validado con `z.uuid()`) precarga correo y vincula; si no es válido o la solicitud no es convertible, formulario sin precarga con aviso informativo; el formulario lleva una `idempotencyKey` oculta generada en el servidor | H1, H10 |
| `/admin/solicitudes` | S2 | Bandeja con contador de nuevas; filtro por estado; convertir en invitación, descartar; anonimizadas sin datos personales ni acción de convertir | H10, FR-049 |
| `/admin/organizaciones` | S2 | Lista: nombre, tipo, estado, creación, cuota diaria/mensual, consumo del mes actual; editar cuota (diálogo), suspender (diálogo con motivo obligatorio ≤ 500) / reactivar (confirmación) | H7, FR-024a, FR-030–031 |
| `/admin/consumo` | S2 | Periodo: hoy, mes actual, mes anterior, rango; por organización simulaciones, tokens entrada/salida, costo US$ y totales; estado vacío explicativo | H7, FR-033 |
| `/design` | S2 | Tokens y componentes vivos en claro y oscuro con estados | H6, FR-044 |

Un vendedor nunca ve la navegación de administración; si abre una ruta `S2` ve el estado "sin
permiso" (HTTP 403 en el render, sin revelar datos). Un superadmin con `aal1` que abre cualquier ruta
privada es redirigido a `/mfa/verificar` o `/mfa/registrar`.

## Navegación por rol

- **Vendedor**: Inicio · Perfil (barra inferior en < 768 px; barra superior/lateral en escritorio).
- **Superadmin (S2)**: Invitaciones · Solicitudes (con contador) · Organizaciones · Consumo · Design system.
- **Menú de cuenta** (ambos): Perfil · Tema (claro/oscuro/sistema, radio group) · Retomar onboarding
  (solo vendedor) · Cerrar sesión. Se abre/recorre/cierra con teclado; Escape devuelve el foco.
- Enlace "Saltar al contenido" como primer elemento enfocable.

## Destino tras iniciar sesión

```text
superadmin sin factor            → /mfa/registrar
superadmin con factor, aal1      → /mfa/verificar → (aal2) → next || /admin/invitaciones
vendedor sin pertenencia operativa → /acceso-suspendido
vendedor onboarding pending|in_progress → /onboarding
vendedor                         → next || /inicio
```

## Errores globales

- `not-found.tsx`: 404 con la marca y enlace a inicio/landing.
- `error.tsx` / `global-error.tsx`: mensaje amigable, botón "Reintentar", id de referencia; sin trazas.
