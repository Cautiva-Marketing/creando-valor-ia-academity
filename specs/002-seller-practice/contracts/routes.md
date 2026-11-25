# Contrato: rutas de la UI (002)

Convenciones de [001/contracts/routes.md](../../001-platform-foundation/contracts/routes.md): 360 px
sin scroll horizontal, solo teclado, estados vacío / carga (skeleton) / error recuperable / sin
permiso / éxito (FR-061), acceso decidido en servidor con `requireOperativeUser()`. Acceso **V** =
vendedor con pertenencia operativa en su organización personal. Cualquier id ajeno (otra
organización u otro usuario) → `notFound()` (no revela existencia, AC-01). Aviso de uso de IA
visible en configuración, sesión y resultado.

## Navegación del vendedor (FR-053)

Barra inferior móvil y lateral de escritorio: **Hoy** (`/inicio`), **Practicar** (`/practicar`),
**Historial** (`/historial`), **Mis productos** (`/productos`). Perfil se accede desde el menú de
cuenta. El onboarding (paso "primer paso sugerido") enlaza a `/productos/nuevo`.

## Rutas

| Ruta | Acceso | Contenido / comportamiento | Historia / FR |
|---|---|---|---|
| `/inicio` ("Hoy") | V | Orden: (1) práctica activa → tarjeta "Tienes una práctica en curso" + "Retomar"; si no, práctica configurada → "Continuar" a su pantalla previa. (2) Acción recomendada (FR-052): sin productos → pasos guiados (registrar producto, agregar objeciones, primera práctica); sin objeciones → "Agrega objeciones"; sin evaluaciones → "Haz tu primera práctica"; si no → "Practica <etapa>" → `/practicar?producto=<último usado>&foco=<etapa>`. (3) Último resultado (puntaje, nivel, fecha, tendencia ± vs. anterior) → resultado. (4) Franja C.A.U.T.I.V.A.™ (últimas 5 evaluadas). (5) Cuota restante día/mes o motivo + renovación. (6) Accesos rápidos. Mantiene la tarjeta "Retomar onboarding" de 001 | H9, FR-051, FR-052 |
| `/productos` | V | Lista: nombre, sector, precio (`S/ 1 250,00` o rango), versión vigente, nº de objeciones, estado. Filtro `?estado=activos\|archivados` (por defecto activos), búsqueda `?q=`, paginación 20. Vacío: "Registrar mi primer producto" + explicación | H1, FR-004 |
| `/productos/nuevo` | V | Formulario (sector, nombre, descripción, precio fijo/rango, beneficios 1–10, diferenciadores, datos verificables) con listas dinámicas accesibles y aviso de datos ficticios (FR-005). Al guardar → `/productos/[id]` con toast | H1, FR-001, FR-005 |
| `/productos/[id]` | V (org) | Pestañas: **Datos** (edición; guardar crea versión nueva; muestra "Versión N · fecha"), **Objeciones** (lista, crear/editar/eliminar, sugerencias por categoría según sector, contador `n/20`), **Versiones** (lista de solo lectura). Acciones: Archivar / Reactivar (con confirmación), "Practicar con este producto" | H1, H2, FR-002–FR-008 |
| `/practicar` | V | Si hay sesión activa → tarjeta de práctica en curso con "Retomar" y "Terminar y evaluar" (sin formulario, FR-015). Si no: formulario (producto activo con objeciones, 1–3 objeciones, dificultad 1–5 con descripción visible, pistas, etapa foco opcional desde `?foco=`), cuota restante; si hay una configurada, aviso de que se descartará. Cuota o topes agotados → formulario deshabilitado con motivo y renovación (AC-07). Query: `producto`, `foco` (validadas con Zod; inválidas se ignoran). Progreso durante la generación ("Preparando a tu comprador…") | H3, FR-009–FR-017 |
| `/practicas/[id]` | V (dueño) | Vista según estado: **configured** → pantalla previa (FR-014) con "Comenzar"; si venció o fue descartada → mensaje y "Configurar otra". **active** → chat + panel (FR-021–FR-031). **finalized** → según `evaluation_status`: `pending`/`in_progress` → progreso por fases (polling a `/api/practicas/[id]/estado`); `failed` → mensaje + "Reintentar evaluación" (si quedan) + transcripción; `unavailable` → mensaje final + transcripción; `not_applicable` → "No fue evaluada porque no enviaste mensajes" + transcripción. **evaluated** → resultado (FR-046–FR-048). **discarded** → mensaje + "Configurar otra" | H3–H7 |
| `/historial` | V | Lista de sesiones comenzadas (activa, finalizada, evaluada) más reciente primero, 20 por página: producto (vN), dificultad, fecha y hora (zona de la org), puntaje, nivel, estado. Filtros en la query: `producto` (uuid), `dificultad` (1–5), `desde`/`hasta` (`YYYY-MM-DD`), `pagina`. Gráfico de evolución (≥ 2 evaluadas) con "Ver como tabla", franja C.A.U.T.I.V.A.™ filtrada. Vacío: "Configura tu primera práctica". Activa → "Retomar"; `failed` → "Reintentar evaluación" | H8, FR-049, FR-050 |

## Anclas y foco en `/practicas/[id]` (resultado)

- Cada mensaje de la transcripción tiene `id="m{seq}"` y `tabindex="-1"`.
- Cada criterio tiene `id="criterio-{key}"`. Una cita es `<a href="#m7">` con el texto literal del
  mensaje guardado (FR-047); al activarla: foco en el mensaje, resaltado (token
  `--color-highlight`), y un enlace "Volver al criterio" dentro del mensaje resaltado.

## Errores y estados por pantalla

| Pantalla | Vacío | Carga | Error recuperable | Sin permiso | Éxito |
|---|---|---|---|---|---|
| Hoy | pasos guiados | skeleton de tarjetas | `error.tsx` con reintentar | — (solo V) | — |
| Productos | primer producto | skeleton de lista | reintentar | `notFound` en ids ajenos | toast al guardar/archivar |
| Practicar | sin productos/objeciones → enlace a crear | progreso de generación | IA no disponible → "Reintentar" | — | redirección a pantalla previa |
| Sesión | — | skeleton de chat | mensaje "no enviado" + "Reintentar"; proveedor lento → "El cliente está tardando, reintentando…" | `notFound` | anuncio accesible por turno |
| Evaluación/Resultado | "Sin evidencia suficiente para calificar" | fases de progreso | "Reintentar evaluación" | `notFound` | resultado |
| Historial | primera práctica | skeleton | reintentar | — | — |
