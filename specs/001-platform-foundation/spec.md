# Feature Specification: Fundación de la plataforma Creando Valor IA™

**Feature Branch**: `001-platform-foundation`

**Created**: 2026-11-23

**Status**: Approved

**Input**: User description: "Fundación de la plataforma Creando Valor IA™ (design system, acceso por invitación, organización personal y base multiempresa). Primera entrega del SaaS descrito en el documento maestro; deja lista la base para la práctica del vendedor (feature 002) y, más adelante, empresas y equipos. Referencia visual: prototipo https://cvia.idw.com.pe/ (tinta verde, acento ají, Bricolage Grotesque + Figtree), refinando su identidad y superando su UX." (descripción completa en `docs/speckit/etapa-1-001-fundacion.md`)

## Clarifications

### Session 2026-11-23

- Q: ¿Qué rol debe tener la persona invitada dentro de su propia organización personal, dado que la constitución exige MFA obligatorio para todo `admin_empresa`? → A: Solo rol `vendedor`; la propiedad se deriva de que la organización es de tipo `personal` con un único miembro. `admin_empresa` queda reservado para organizaciones tipo `empresa` (con MFA obligatorio, en etapas posteriores).
- Q: ¿Debe el superadministrador poder suspender y reactivar el acceso desde la interfaz en esta feature? → A: Sí, a nivel de organización: desde el listado de organizaciones suspende o reactiva una organización (con confirmación y motivo, auditado); sus miembros pierden acceso de inmediato. No hay gestión de pertenencias individuales en esta etapa.
- Q: ¿Cómo se restablece el segundo factor (TOTP) de un superadministrador que perdió su app autenticadora? → A: Solo mediante un procedimiento operativo interno documentado (script del lado del servidor ejecutado por el equipo técnico) que elimina el factor, cierra las sesiones de esa cuenta y registra el restablecimiento en la auditoría. Sin interfaz.
- Q: ¿Qué límites concretos de intentos deben aplicarse antes de frenar temporalmente al usuario (FR-023)? → A: Inicio de sesión: 5 fallos por cuenta (y 20 por IP) en 15 min → bloqueo de 15 min; TOTP: 5 fallos en 15 min → bloqueo de 15 min; recuperación: 3 solicitudes por correo por hora; activación de invitación: 10 intentos por IP por hora; solicitar acceso: 3 envíos por IP por hora.
- Q: ¿Cuánto tiempo se conservan los datos personales de las solicitudes de acceso? → A: Las descartadas se anonimizan (se borran nombre, correo, empresa y mensaje) a los 90 días del descarte; las nuevas sin revisar durante 180 días pasan automáticamente a descartadas; las invitadas se conservan mientras exista la invitación o la cuenta vinculada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El superadministrador invita a un vendedor individual (Priority: P1)

Como superadministrador (equipo Cautiva) invito por correo a una persona para que use la plataforma como vendedor individual. Elijo el plazo de vencimiento (por defecto 7 días), y desde un listado veo el estado de cada invitación (pendiente, aceptada, vencida, revocada), con la posibilidad de reenviarla o revocarla.

**Why this priority**: el acceso es solo por invitación; sin este flujo nadie puede entrar a la plataforma. Es la puerta de entrada de todo el producto.

**Independent Test**: un superadministrador autenticado crea una invitación, el correo llega a la bandeja de destino con la marca y en español, y la invitación aparece como "pendiente" en el listado; luego se reenvía y se revoca, y cada cambio queda reflejado en el estado y en la auditoría.

**Acceptance Scenarios**:

1. **Given** un superadministrador autenticado con MFA, **When** invita a `ana@ejemplo.pe` con el plazo por defecto, **Then** se envía un correo de invitación con la marca, en español, con un enlace de un solo uso que vence en 7 días, y la invitación aparece como "pendiente" con su fecha de vencimiento.
2. **Given** una invitación pendiente, **When** el superadministrador la reenvía, **Then** el enlace anterior deja de funcionar, se emite un enlace nuevo, el plazo se reinicia y se registra el reenvío en la auditoría.
3. **Given** una invitación pendiente, **When** el superadministrador la revoca, **Then** su estado pasa a "revocada", su enlace deja de permitir el acceso y la revocación queda auditada.
4. **Given** una invitación cuyo plazo ya pasó sin ser aceptada, **When** el superadministrador consulta el listado, **Then** la ve como "vencida" y puede reenviarla (lo que genera un enlace nuevo y la vuelve "pendiente").
5. **Given** el correo de una persona que ya tiene cuenta activa o una invitación pendiente, **When** el superadministrador intenta invitarla de nuevo, **Then** el sistema lo impide con un mensaje claro y ofrece reenviar la invitación existente cuando corresponde.
6. **Given** un usuario que no es superadministrador, **When** intenta crear, reenviar, revocar o listar invitaciones (por la interfaz o directamente contra el servidor), **Then** la operación se rechaza y ve el estado "sin permiso".

---

### User Story 2 - La persona invitada activa su cuenta y obtiene su organización personal (Priority: P1)

Como persona invitada abro el enlace del correo, defino mi nombre y una contraseña segura, acepto los términos de uso y el aviso de uso de IA, y entro a la plataforma. Se crea automáticamente mi organización personal, de la que soy el único miembro (y por tanto su dueña), con el rol de vendedor.

**Why this priority**: completa el ciclo de alta y crea la unidad de aislamiento (organización) sobre la que se apoya toda la plataforma y la feature 002.

**Independent Test**: con una invitación pendiente, se abre el enlace, se completa el formulario y se verifica que el usuario queda autenticado dentro de la app, que existe una organización personal nueva con su pertenencia activa como vendedor (único miembro), y que la aceptación quedó auditada. Con una invitación vencida o revocada, se verifica que no hay acceso (AC-02).

**Acceptance Scenarios**:

1. **Given** una invitación pendiente y vigente, **When** la persona abre el enlace, **Then** ve su correo (no editable), y un formulario para nombre, contraseña, aceptación de términos y aceptación del aviso de uso de IA.
2. **Given** el formulario completo con una contraseña que cumple la política, **When** la persona confirma, **Then** se crea su cuenta, se crea su organización personal (tipo "personal", estado activo, zona horaria por defecto America/Lima), queda como su único miembro activo con el rol vendedor, la invitación pasa a "aceptada", se registra la aceptación en la auditoría y entra autenticada a la app (al onboarding).
3. **Given** una contraseña que no cumple la política, **When** la persona intenta confirmar, **Then** ve junto al campo qué requisito falta, sin perder lo ya escrito.
4. **Given** que no marcó la aceptación de términos o del aviso de IA, **When** intenta confirmar, **Then** no puede continuar y se le indica qué falta.
5. **Given** una invitación vencida, revocada o ya aceptada (o un enlace manipulado), **When** alguien abre el enlace, **Then** no se permite crear cuenta ni acceder, y ve un mensaje claro que explica la situación y cómo pedir una nueva invitación (AC-02).
6. **Given** que la persona acepta la invitación, **When** luego intenta usar el mismo enlace otra vez, **Then** se le indica que la invitación ya fue usada y se le ofrece ir a iniciar sesión.

---

### User Story 3 - Inicio y cierre de sesión, recuperación de contraseña, sin registro abierto (Priority: P1)

Como usuario inicio y cierro sesión, recupero mi contraseña por correo y mi sesión persiste entre visitas. Nadie puede registrarse sin invitación.

**Why this priority**: sin sesión estable y recuperación de contraseña los usuarios activados no pueden volver a la plataforma.

**Independent Test**: un vendedor ya activado inicia sesión, cierra el navegador, vuelve y sigue dentro; cierra sesión y ya no accede a pantallas privadas; solicita recuperación, recibe el correo con la marca y define una contraseña nueva.

**Acceptance Scenarios**:

1. **Given** un usuario activo con credenciales correctas, **When** inicia sesión, **Then** entra a la app (al onboarding si no lo completó ni lo saltó; si no, a su inicio).
2. **Given** credenciales incorrectas o un correo inexistente, **When** intenta iniciar sesión, **Then** ve un mensaje genérico que no revela si el correo existe.
3. **Given** un usuario con sesión iniciada, **When** cierra el navegador y vuelve dentro del periodo de persistencia, **Then** sigue autenticado sin volver a ingresar credenciales.
4. **Given** un usuario con sesión iniciada, **When** cierra sesión desde el menú de cuenta, **Then** su sesión termina en ese dispositivo y cualquier pantalla privada lo redirige al inicio de sesión.
5. **Given** un usuario que olvidó su contraseña, **When** la solicita con su correo, **Then** ve siempre la misma confirmación (exista o no la cuenta) y, si la cuenta existe, recibe un correo con la marca y en español con un enlace de un solo uso y vigencia limitada para definir una contraseña nueva.
6. **Given** un enlace de recuperación vencido o ya usado, **When** se abre, **Then** se muestra un mensaje claro y la opción de solicitar uno nuevo.
7. **Given** un visitante sin invitación, **When** busca una forma de crear cuenta, **Then** no existe ningún registro abierto; solo puede "Solicitar acceso" (Historia 10), y cualquier intento directo de alta sin invitación válida es rechazado por el servidor.
8. **Given** 5 intentos fallidos de inicio de sesión para la misma cuenta en 15 minutos, **When** se intenta de nuevo, **Then** el sistema frena nuevos intentos durante 15 minutos con un mensaje claro que indica cuándo reintentar (FR-023). Si se superan 3 solicitudes de recuperación para el mismo correo en una hora, las adicionales no envían correo y muestran la misma confirmación genérica, sin revelar el límite ni si la cuenta existe.

---

### User Story 4 - El superadministrador entra solo con MFA (TOTP) (Priority: P1)

Como superadministrador inicio sesión con un segundo factor obligatorio basado en código temporal (TOTP) generado por una app autenticadora.

**Why this priority**: el superadministrador tiene alcance sobre todas las organizaciones; sin MFA, una credencial filtrada compromete la plataforma entera.

**Independent Test**: una cuenta de superadministrador sin factor registrado es obligada a registrarlo antes de ver cualquier pantalla de administración; con el factor registrado, la contraseña sola nunca basta; cada ingreso queda auditado.

**Acceptance Scenarios**:

1. **Given** un superadministrador sin segundo factor registrado, **When** inicia sesión con su contraseña, **Then** solo puede acceder a la pantalla de registro del factor (código QR + clave manual + verificación de un código) y a cerrar sesión; ninguna otra pantalla ni operación de administración está disponible.
2. **Given** un superadministrador con factor registrado, **When** ingresa su contraseña correcta, **Then** se le pide el código TOTP y solo tras verificarlo accede a la administración.
3. **Given** un código TOTP incorrecto o expirado, **When** lo ingresa, **Then** ve un error claro y, tras 5 intentos fallidos en 15 minutos, se bloquean nuevos intentos durante 15 minutos (FR-023).
4. **Given** una sesión de superadministrador que solo completó la contraseña, **When** intenta invocar cualquier operación de administración directamente contra el servidor, **Then** la operación se rechaza.
5. **Given** cualquier inicio de sesión de superadministrador (exitoso o fallido en el segundo factor), **When** ocurre, **Then** queda registrado en la auditoría con actor, acción, resultado y marca de tiempo.

---

### User Story 5 - App shell consistente con tema claro, oscuro o del sistema (Priority: P2)

Como usuario navego una estructura de app consistente: barra superior con la marca, navegación principal (en móvil, barra inferior o menú accesible), y un menú de cuenta con perfil, selector de tema (claro, oscuro, sistema) y cierre de sesión.

**Why this priority**: es el marco donde vive toda la experiencia de la feature 002 y siguientes; define la percepción de calidad del producto.

**Independent Test**: con un vendedor y con un superadministrador, se recorre la navegación a 360 px y en escritorio usando solo teclado, se cambia el tema y se cierra sesión; la auditoría automatizada de accesibilidad no reporta violaciones serias.

**Acceptance Scenarios**:

1. **Given** un vendedor autenticado, **When** abre la app en escritorio, **Then** ve la barra superior con la marca, la navegación principal con las secciones disponibles para su rol y el menú de cuenta.
2. **Given** un vendedor autenticado en un ancho de 360 px, **When** abre la app, **Then** la navegación principal está disponible como barra inferior o menú accesible, sin desplazamiento horizontal y con objetivos táctiles de 44 px o más.
3. **Given** el menú de cuenta, **When** el usuario elige tema claro, oscuro o sistema, **Then** el tema se aplica de inmediato sin parpadeo de tema incorrecto al recargar, y la preferencia se recuerda entre visitas.
4. **Given** el tema "sistema", **When** el sistema operativo cambia entre claro y oscuro, **Then** la app sigue ese cambio.
5. **Given** un usuario que navega solo con teclado, **When** recorre la app shell, **Then** existe un enlace "Saltar al contenido", el foco es siempre visible, el orden es lógico y los menús se abren, recorren y cierran con teclado (Escape devuelve el foco al disparador).
6. **Given** un superadministrador, **When** navega, **Then** ve además las secciones de administración (invitaciones, solicitudes de acceso, organizaciones y cuotas, consumo de IA, design system); un vendedor nunca las ve ni puede acceder a ellas.

---

### User Story 6 - Design system documentado en /design (Priority: P2)

Como superadministrador consulto una página interna `/design` que documenta el sistema de diseño: tokens (colores semánticos en claro y oscuro, escala tipográfica, espaciado, radios, elevación, motion) y todos los componentes base con sus variantes y estados.

**Why this priority**: garantiza una identidad única y coherente (refinando la del prototipo) y acelera las features siguientes; es requisito de la constitución que toda la UI use tokens.

**Independent Test**: el superadministrador abre `/design`, ve cada token y cada componente en claro y oscuro con sus estados (normal, foco, deshabilitado, error, carga), y un vendedor que intenta abrir `/design` ve el estado "sin permiso".

**Acceptance Scenarios**:

1. **Given** un superadministrador, **When** abre `/design`, **Then** ve los tokens de color semánticos (primario, acento, éxito, advertencia, error, superficies y texto) en claro y oscuro con su relación de contraste, la escala tipográfica (títulos con Bricolage Grotesque, texto con Figtree), espaciado, radios, elevación y motion.
2. **Given** `/design`, **When** se recorre la sección de componentes, **Then** están documentados con ejemplos vivos: botón (variantes y tamaños), input, textarea autoajustable, select, checkbox, radio, switch, tag/badge, card, tabla responsive, tabs, diálogo, sheet / bottom-sheet móvil, toast, tooltip, skeleton, empty state, barra de progreso, gauge, anillo de puntaje, avatar y menú.
3. **Given** cada componente interactivo, **When** se usa solo con teclado o con lector de pantalla, **Then** es operable, anuncia su nombre, rol y estado, y muestra foco visible.
4. **Given** la preferencia de movimiento reducido del sistema, **When** está activa, **Then** las animaciones se reducen o se eliminan.
5. **Given** un usuario sin rol de superadministrador, **When** intenta abrir `/design`, **Then** ve el estado "sin permiso".

---

### User Story 7 - El superadministrador configura cuotas, suspende organizaciones y ve el consumo de IA (Priority: P2)

Como superadministrador configuro la cuota de simulaciones de cada organización (por día y por mes), suspendo o reactivo organizaciones cuando hace falta cortar el acceso, y veo el consumo de IA agregado por organización (simulaciones, tokens y costo estimado) sin acceder al contenido de las conversaciones.

**Why this priority**: es la base de control de costos que la feature 002 usará para bloquear sesiones al agotarse la cuota (AC-07); debe existir antes de que se consuma IA.

**Independent Test**: el superadministrador abre el listado de organizaciones, cambia la cuota diaria y mensual de una, ve el cambio reflejado y auditado, suspende una organización de prueba (su vendedor pierde el acceso de inmediato) y la reactiva, y consulta el consumo agregado por periodo (vacío o con datos de prueba) sin ninguna vía de acceso a contenido de conversaciones.

**Acceptance Scenarios**:

1. **Given** un superadministrador, **When** abre el listado de organizaciones, **Then** ve cada organización con tipo, estado, fecha de creación, cuota diaria, cuota mensual y consumo del periodo actual.
2. **Given** una organización, **When** el superadministrador cambia su cuota diaria o mensual a valores válidos (enteros ≥ 0, con la diaria no mayor que la mensual), **Then** el cambio se guarda, se muestra una confirmación y queda auditado con el valor anterior y el nuevo.
3. **Given** valores inválidos (negativos, no enteros o diaria > mensual), **When** intenta guardar, **Then** ve el error junto al campo y nada cambia.
4. **Given** el panel de consumo, **When** el superadministrador elige un periodo (día, mes actual, mes anterior o rango), **Then** ve por organización: número de simulaciones, tokens de entrada, tokens de salida y costo estimado, más los totales.
5. **Given** que aún no hay consumo registrado, **When** abre el panel, **Then** ve un estado vacío explicativo.
6. **Given** el panel de consumo, **When** se inspecciona cualquier vista u operación disponible al superadministrador, **Then** ninguna expone el contenido de mensajes, transcripciones ni evaluaciones.
7. **Given** una organización activa en el listado, **When** el superadministrador elige "Suspender", indica un motivo (obligatorio, máx. 500 caracteres) y confirma, **Then** la organización pasa a "suspendida", el cambio queda auditado con el motivo, y sus miembros pierden el acceso de inmediato (incluidas las sesiones ya abiertas, en su siguiente petición) y ven un mensaje explicativo con un medio de contacto.
8. **Given** una organización suspendida, **When** el superadministrador elige "Reactivar" y confirma, **Then** vuelve a "activa", el cambio queda auditado y sus miembros recuperan el acceso sin necesidad de una nueva invitación.

---

### User Story 8 - Onboarding breve del vendedor (Priority: P3)

Como vendedor recién activado completo un onboarding de 3 pasos como máximo (bienvenida, cómo funciona la práctica, primer paso sugerido), que puedo saltar y retomar.

**Why this priority**: mejora la activación, pero la plataforma es usable sin él.

**Independent Test**: un vendedor nuevo entra por primera vez, ve el paso 1, avanza, sale y al volver retoma donde quedó; otro lo salta, llega al inicio y puede reabrirlo desde la app.

**Acceptance Scenarios**:

1. **Given** un vendedor que inicia sesión por primera vez, **When** entra, **Then** ve el onboarding con un indicador de progreso ("Paso 1 de 3").
2. **Given** el onboarding en el paso 2, **When** el vendedor sale y vuelve más tarde, **Then** retoma en el paso 2.
3. **Given** cualquier paso, **When** elige "Saltar", **Then** llega a su inicio y el onboarding no vuelve a abrirse automáticamente, pero puede retomarlo desde el inicio o el menú de cuenta.
4. **Given** el último paso, **When** lo completa, **Then** se registra como completado y se le dirige al primer paso sugerido (en esta etapa, completar su perfil o el inicio con el aviso "La práctica llega pronto" si la feature 002 aún no está disponible).

---

### User Story 9 - El vendedor edita su perfil (Priority: P3)

Como vendedor edito mi perfil: nombre, avatar con iniciales y zona horaria.

**Why this priority**: necesario para personalizar fechas y la identidad visible, pero no bloquea el resto.

**Independent Test**: el vendedor cambia su nombre y zona horaria; el avatar con iniciales y las fechas mostradas se actualizan de inmediato.

**Acceptance Scenarios**:

1. **Given** un vendedor en su perfil, **When** cambia su nombre a un valor válido (1 a 80 caracteres sin solo espacios), **Then** se guarda y su avatar muestra las iniciales derivadas del nuevo nombre en la barra superior y el menú.
2. **Given** el selector de zona horaria (con buscador y valor por defecto America/Lima), **When** elige otra zona, **Then** las fechas y horas de la app se muestran en esa zona.
3. **Given** un nombre vacío o demasiado largo, **When** intenta guardar, **Then** ve el error junto al campo.
4. **Given** el perfil, **When** lo consulta, **Then** ve su correo (no editable en esta etapa) y la fecha de aceptación de los términos y del aviso de IA.

---

### User Story 10 - Landing pública y "Solicitar acceso" (Priority: P3)

Como visitante veo una landing pública mínima que explica la propuesta ("Practica la venta antes de hacerla de verdad") con un formulario de "Solicitar acceso". La solicitud queda guardada para que el superadministrador la revise y la convierta en invitación o la descarte.

**Why this priority**: genera demanda y sustituye al registro abierto, pero el acceso por invitación funciona sin ella.

**Independent Test**: un visitante envía una solicitud desde un móvil de 360 px; el superadministrador la ve en su bandeja de solicitudes, la convierte en invitación (con el correo precargado) y la solicitud queda marcada como "invitada".

**Acceptance Scenarios**:

1. **Given** un visitante, **When** abre la página pública, **Then** ve la propuesta de valor, una explicación breve de cómo funciona, el aviso de uso de IA, el botón "Solicitar acceso" y el acceso a "Iniciar sesión".
2. **Given** el formulario de solicitud (nombre, correo, empresa u ocupación opcional, mensaje opcional y aceptación de la política de privacidad), **When** lo envía con datos válidos, **Then** ve una confirmación clara y la solicitud queda en estado "nueva".
3. **Given** datos inválidos o sin aceptar la política, **When** lo envía, **Then** ve los errores junto a cada campo sin perder lo escrito.
4. **Given** envíos repetidos o automatizados, **When** superan los límites anti-abuso (más de 3 envíos por IP por hora, FR-023), **Then** son rechazados sin revelar detalles internos; un correo con una solicitud "nueva" ya existente no genera duplicados.
5. **Given** el superadministrador en la bandeja de solicitudes, **When** elige "Convertir en invitación", **Then** se abre la creación de invitación con el correo precargado y, al enviarla, la solicitud pasa a "invitada" y queda vinculada a la invitación.
6. **Given** una solicitud, **When** el superadministrador la descarta, **Then** pasa a "descartada" y deja de aparecer entre las pendientes de revisar.

---

### Edge Cases

- **Usuario de la organización A intenta leer o escribir datos de la organización B** (cambiando identificadores en la URL o en peticiones directas): el servidor y el almacenamiento de datos lo rechazan; responde como "no encontrado" o "sin permiso" sin revelar existencia del recurso (AC-01).
- **Dos clics simultáneos en "Activar cuenta"** o doble envío del formulario de invitación: se procesan una sola vez (una sola cuenta, una sola organización personal, un solo registro de auditoría de aceptación).
- **Invitación revocada mientras la persona tiene el formulario abierto**: al confirmar, se rechaza con el mensaje de AC-02.
- **Invitación que vence mientras la persona completa el formulario**: se valida al confirmar, no solo al abrir el enlace.
- **Correo con mayúsculas o espacios** (`Ana@Ejemplo.pe `): se normaliza para detectar duplicados e invitaciones existentes.
- **Reenvío de una invitación vencida**: genera enlace nuevo, invalida el anterior y reinicia el plazo.
- **Fallo del envío de correo**: la invitación se crea pero queda marcada con "envío fallido"; el superadministrador ve el aviso y puede reintentar el envío.
- **Pertenencia suspendida u organización suspendida** (en esta etapa no existe suspensión a nivel de usuario): quien intenta iniciar sesión o usa una sesión previa: se le niega el acceso con un mensaje claro de contacto.
- **Organización suspendida**: sus miembros no pueden operar en ella, aunque tengan una sesión abierta (se verifica en el servidor en cada petición); ven un mensaje explicativo con un medio de contacto. Las invitaciones pendientes hacia una organización suspendida tampoco permiten el acceso.
- **Sesión expirada en medio de una acción**: se pide iniciar sesión de nuevo y, tras hacerlo, se vuelve a la pantalla donde estaba (`next`). Conservar lo escrito no se exige en esta etapa (formularios cortos).
- **El superadministrador pierde su app autenticadora**: no hay autoservicio ni pantalla de restablecimiento en esta etapa; la recuperación se hace solo mediante el procedimiento operativo interno de FR-027a, y queda auditada. En su siguiente inicio de sesión, la cuenta debe registrar un factor nuevo (escenario 1 de la Historia 4).
- **Ruta inexistente**: página 404 amigable con la marca y un camino de regreso. **Error inesperado**: página de error amigable con opción de reintentar, sin detalles técnicos.
- **Sin conexión o red lenta**: los formularios muestran estado de envío, no permiten doble envío y muestran un error recuperable si falla.
- **Superadministrador intentando ver datos de negocio de una organización** (más allá de los agregados de consumo y su configuración): no hay vista ni operación que lo permita en esta etapa.
- **Solicitud anonimizada por retención**: deja de mostrar datos personales en la bandeja y no puede convertirse en invitación; si la misma persona vuelve a solicitar acceso, se crea una solicitud `nueva` independiente.
- **Nombre con un solo carácter, emojis o caracteres acentuados**: las iniciales del avatar se derivan correctamente (máximo 2 caracteres) y nunca quedan vacías.

## Requirements *(mandatory)*

### Functional Requirements

**Modelo multiempresa y aislamiento**

- **FR-001**: El sistema DEBE modelar desde esta etapa: organizaciones (tipo `personal` | `empresa`, nombre, slug único, sector, zona horaria, estado activo/suspendido), pertenencias usuario–organización–rol (estado, fecha de invitación y de alta), invitaciones, equipos (sin interfaz), registros de auditoría, uso de IA, cuotas y solicitudes de acceso.
- **FR-002**: Los roles soportados DEBEN ser `superadmin` (nivel plataforma), `admin_empresa`, `supervisor`, `instructor` y `vendedor`; un usuario puede tener más de un rol en una misma organización. En esta etapa solo `superadmin` y `vendedor` (en su organización personal) tienen interfaz. El rol `admin_empresa` se reserva para organizaciones tipo `empresa` y NO se asigna en organizaciones personales; cuando se use, exigirá MFA según la constitución.
- **FR-003**: Todo dato de negocio DEBE pertenecer a exactamente una organización, y toda lectura o escritura DEBE verificar en el servidor la pertenencia activa del usuario a esa organización y su autorización por rol, sin confiar en identificadores, filtros ni roles enviados por el navegador.
- **FR-004**: El almacenamiento de datos DEBE aplicar además su propia barrera de aislamiento por organización en todas las tablas expuestas, como defensa adicional a la autorización del servidor.
- **FR-005**: DEBEN existir pruebas automatizadas que demuestren, con dos organizaciones de prueba, que un usuario de la organización A no puede leer, crear, modificar ni eliminar datos de la organización B, tanto a nivel de almacenamiento como de flujo de punta a punta (AC-01).
- **FR-006**: El superadministrador DEBE poder ver y configurar metadatos de organizaciones, cuotas y consumo agregado, pero NO DEBE tener vistas ni operaciones que expongan contenido de conversaciones, mensajes, documentos o evaluaciones.

**Invitaciones**

- **FR-007**: El superadministrador DEBE poder invitar a una persona por correo como vendedor individual, eligiendo un plazo de vencimiento entre 1 y 30 días (por defecto 7).
- **FR-008**: Cada invitación DEBE tener un enlace único, imposible de adivinar y de un solo uso, y un estado derivado: `pendiente`, `aceptada`, `vencida` o `revocada`.
- **FR-009**: El superadministrador DEBE poder listar invitaciones filtrando por estado y buscando por correo, y reenviar (invalida el enlace anterior, emite uno nuevo y reinicia el plazo) o revocar invitaciones pendientes o vencidas.
- **FR-010**: El sistema DEBE impedir crear una invitación para un correo que ya tiene cuenta activa o una invitación pendiente, con un mensaje claro.
- **FR-011**: Una invitación vencida, revocada o ya aceptada NO DEBE permitir crear cuenta ni acceder; DEBE mostrarse un mensaje claro en español que explique la causa y cómo solicitar una nueva (AC-02). La validez se comprueba en el servidor al abrir el enlace y de nuevo al confirmar.
- **FR-012**: El sistema DEBE enviar correos transaccionales de invitación con la marca Creando Valor IA™, en español, con el nombre de quien invita (equipo Cautiva), el plazo de vencimiento y una versión en texto plano.
- **FR-013**: Si el envío de un correo falla, la invitación DEBE quedar marcada con el fallo y el superadministrador DEBE poder reintentar el envío.

**Activación de cuenta y organización personal**

- **FR-014**: Al abrir una invitación válida, la persona DEBE poder definir su nombre y una contraseña que cumpla la política (mínimo 10 caracteres, no figurar en listas de contraseñas comunes o filtradas, distinta del correo), con indicador de requisitos en tiempo real.
- **FR-015**: La persona DEBE aceptar explícitamente los términos de uso y el aviso de uso de IA; el sistema DEBE guardar qué versión de cada documento aceptó y cuándo.
- **FR-016**: Al confirmar, el sistema DEBE, como una única operación atómica e idempotente: crear la cuenta, crear la organización personal (tipo `personal`, estado activo, nombre igual al nombre de la persona (`full_name`) y slug único derivado de ese nombre, zona horaria America/Lima), crear la pertenencia activa con el rol `vendedor` (único miembro de la organización), asignarle la cuota por defecto, marcar la invitación como aceptada y registrar la aceptación en la auditoría.
- **FR-017**: Tras activar la cuenta, la persona DEBE quedar autenticada y llegar al onboarding.

**Sesión y credenciales**

- **FR-018**: Los usuarios DEBEN poder iniciar sesión con correo y contraseña y cerrar sesión desde el menú de cuenta.
- **FR-019**: La sesión DEBE persistir entre visitas durante un máximo de 30 días con renovación por actividad, y expirar tras 7 días sin actividad; para el superadministrador, la sesión DEBE expirar tras 12 horas.
- **FR-020**: Los usuarios DEBEN poder recuperar su contraseña mediante un enlace por correo (con la marca, en español) de un solo uso y válido 60 minutos; la respuesta a la solicitud NO DEBE revelar si el correo existe.
- **FR-021**: Al cambiar la contraseña por recuperación, las demás sesiones abiertas del usuario DEBEN cerrarse.
- **FR-022**: NO DEBE existir registro abierto: toda creación de cuenta sin invitación válida DEBE ser rechazada por el servidor.
- **FR-023**: El sistema DEBE limitar en el servidor la frecuencia de intentos, con un mensaje claro al usuario que indique cuándo puede reintentar (sin revelar si la cuenta existe), salvo en la recuperación de contraseña, donde se mantiene la confirmación genérica; con estos límites:
  - Inicio de sesión: 5 intentos fallidos por cuenta o 20 por IP en una ventana de 15 minutos → bloqueo de 15 minutos.
  - Verificación del segundo factor (TOTP): 5 códigos fallidos en 15 minutos → bloqueo de 15 minutos.
  - Recuperación de contraseña: 3 solicitudes por correo por hora (las que se excedan no envían correo y muestran la misma confirmación genérica).
  - Activación de invitación: 10 intentos por IP por hora.
  - Solicitar acceso: 3 envíos por IP por hora.

  Los límites por cuenta y de TOTP se aplican en los flujos de la aplicación; las llamadas directas a la API pública del proveedor de autenticación quedan cubiertas por los límites nativos por IP del proveedor (riesgo residual aceptado y documentado en el plan).
- **FR-024**: Los usuarios con pertenencia suspendida o de una organización suspendida NO DEBEN poder operar en ella; la verificación ocurre en el servidor en cada petición, de modo que una suspensión afecta también a las sesiones ya abiertas. El mensaje indica como medio de contacto el correo de soporte de la plataforma.
- **FR-024a**: El superadministrador DEBE poder suspender (con confirmación y motivo obligatorio) y reactivar organizaciones desde el listado de organizaciones. En esta etapa no hay interfaz para suspender pertenencias individuales; el estado de pertenencia suspendida existe en el modelo para etapas posteriores.

**MFA del superadministrador**

- **FR-025**: El superadministrador DEBE usar un segundo factor TOTP obligatorio; si no lo tiene registrado, tras la contraseña DEBE ser llevado a registrarlo y no DEBE acceder a ninguna otra pantalla u operación hasta completarlo.
- **FR-026**: Toda operación de administración DEBE exigir en el servidor una sesión verificada con segundo factor; una sesión solo con contraseña DEBE ser rechazada.
- **FR-027**: Los inicios de sesión del superadministrador (exitosos y fallidos en el segundo factor) DEBEN registrarse en la auditoría.
- **FR-027a**: El restablecimiento del segundo factor de un superadministrador DEBE hacerse solo mediante un procedimiento operativo interno documentado (script del lado del servidor, sin interfaz) que elimine el factor registrado, cierre todas las sesiones de esa cuenta y registre en la auditoría quién lo ejecutó, para qué cuenta y cuándo. NO DEBE existir ninguna pantalla ni operación expuesta en la aplicación para restablecer factores.

**Auditoría**

- **FR-028**: El sistema DEBE registrar en la auditoría, con actor, organización (si aplica), acción, objeto, datos relevantes (p. ej., valores anterior y nuevo) y marca de tiempo: creación, reenvío, revocación y aceptación de invitaciones; inicios de sesión de superadministrador; cambios de cuota; suspensión (con motivo) y reactivación de organizaciones; conversión o descarte de solicitudes de acceso; y restablecimiento del segundo factor de un superadministrador.
- **FR-029**: Los registros de auditoría NO DEBEN poder modificarse ni eliminarse desde la aplicación, y NO DEBEN contener contraseñas, códigos ni enlaces de un solo uso.

**Cuotas y consumo de IA**

- **FR-030**: Cada organización DEBE tener una cuota de simulaciones diaria y mensual; las organizaciones nuevas reciben una cuota por defecto de 10 simulaciones por día y 100 por mes. El valor por defecto es fijo en esta etapa.
- **FR-031**: El superadministrador DEBE poder editar la cuota diaria y mensual de cada organización con validación (enteros ≥ 0; diaria ≤ mensual); 0 significa sin simulaciones permitidas.
- **FR-032**: El sistema DEBE contar con un registro de uso de IA por organización (usuario, tarea, modelo, tokens de entrada y salida, latencia, costo estimado y marca de tiempo) listo para que la feature 002 lo alimente; en esta etapa no se invoca IA.
- **FR-033**: El superadministrador DEBE ver el consumo agregado por organización y periodo (simulaciones, tokens de entrada, tokens de salida, costo estimado en USD, y totales), con los periodos calculados en la zona horaria de cada organización.

**Onboarding y perfil**

- **FR-034**: El vendedor DEBE ver un onboarding de máximo 3 pasos (bienvenida, cómo funciona la práctica, primer paso sugerido) con indicador de progreso, que puede saltar en cualquier paso y retomar desde el inicio o el menú de cuenta; el sistema DEBE recordar el paso alcanzado y si se completó o saltó.
- **FR-035**: El vendedor DEBE poder editar su nombre (1–80 caracteres) y su zona horaria (lista estándar con buscador); el avatar DEBE generarse con sus iniciales (máximo 2 caracteres) sobre un color derivado de los tokens con contraste AA.
- **FR-036**: Las fechas y horas DEBEN mostrarse en la zona horaria de la organización activa del usuario, con formato local peruano (es-PE). En una organización `personal`, su zona horaria es la que el vendedor elige en su perfil (ambas se actualizan juntas al guardar). El superadministrador, que no pertenece a ninguna organización, ve las fechas en la zona de su perfil.

**App shell, temas y estados**

- **FR-037**: Toda pantalla autenticada DEBE usar una app shell común: barra superior con marca, navegación principal según rol (en móvil, barra inferior o menú accesible) y menú de cuenta con perfil, selector de tema (claro, oscuro, sistema), retomar onboarding (vendedor) y cerrar sesión.
- **FR-038**: El tema elegido DEBE aplicarse sin parpadeo de tema incorrecto al cargar y recordarse entre visitas en el mismo dispositivo; "sistema" DEBE seguir la preferencia del sistema operativo en vivo.
- **FR-039**: Toda pantalla DEBE definir estados de vacío, carga (esqueleto), error recuperable con opción de reintentar, sin permiso y éxito; DEBEN existir páginas 404 y de error inesperado con la marca y un camino de regreso.
- **FR-040**: Los mensajes de error mostrados al usuario NO DEBEN revelar detalles internos (trazas, identificadores internos, consultas).

**Design system**

- **FR-041**: DEBE existir un único sistema de diseño basado en tokens que refine la identidad del prototipo: tinta verde `#0E5A4A` como primario, acento ají `#E89A0C`, papel `#F3F5F1` como superficie clara, Bricolage Grotesque para títulos y Figtree para texto; con tokens semánticos de color (primario, acento, éxito, advertencia, error, información, superficies, bordes, texto) en claro y oscuro, escala tipográfica, espaciado, radios, elevación y motion.
- **FR-042**: Todos los pares de texto/fondo y de componentes interactivos de los tokens DEBEN cumplir contraste WCAG 2.2 AA en ambos temas (4,5:1 texto normal; 3:1 texto grande y elementos de interfaz).
- **FR-043**: DEBEN existir los componentes base: botón (variantes primario, secundario, acento, fantasma, destructivo, enlace; tamaños pequeño, mediano, grande e icono; estado de carga), input, textarea autoajustable, select, checkbox, radio, switch, tag/badge, card, tabla responsive (se adapta a 360 px sin desplazamiento horizontal de la página), tabs, diálogo, sheet / bottom-sheet móvil, toast, tooltip, skeleton, empty state, barra de progreso, gauge, anillo de puntaje, avatar y menú; todos operables por teclado, con foco visible y nombres accesibles.
- **FR-044**: La página `/design` DEBE documentar tokens y componentes con ejemplos vivos en claro y oscuro y sus estados, y ser accesible solo para el superadministrador (verificado en el servidor).
- **FR-045**: Las animaciones DEBEN respetar la preferencia de movimiento reducido.
- **FR-046**: Los objetivos táctiles DEBEN medir 44×44 px o más.

**Landing y solicitudes de acceso**

- **FR-047**: DEBE existir una página pública con la propuesta "Practica la venta antes de hacerla de verdad", una explicación breve del funcionamiento, el aviso de uso de IA, "Solicitar acceso" e "Iniciar sesión", y enlaces a términos de uso y política de privacidad.
- **FR-048**: El formulario "Solicitar acceso" DEBE pedir nombre, correo, empresa u ocupación (opcional), mensaje (opcional, máx. 500 caracteres) y aceptación de la política de privacidad; DEBE protegerse contra envíos automatizados y abusivos, y evitar duplicados de solicitudes "nuevas" para el mismo correo.
- **FR-049**: El superadministrador DEBE ver una bandeja de solicitudes (estados `nueva`, `invitada`, `descartada`) con contador de nuevas, y poder convertir una solicitud en invitación (correo precargado, vinculando ambas) o descartarla.
- **FR-049a**: El sistema DEBE aplicar automáticamente (al menos una vez al día) esta retención a las solicitudes de acceso: (a) las solicitudes `nueva` sin revisar durante 180 días desde su creación pasan a `descartada`; (b) las solicitudes `descartada` se anonimizan a los 90 días del descarte, borrando nombre, correo, empresa u ocupación y mensaje, y conservando solo estado, fechas y la marca de anonimizada; (c) las solicitudes `invitada` se conservan mientras exista la invitación o la cuenta vinculada. Los descartes automáticos quedan auditados con actor "sistema". La anonimización es irreversible.

**Correos y lenguaje**

- **FR-050**: Toda la interfaz y los correos DEBEN estar en español neutro-peruano, en segunda persona, con el aviso visible de uso de IA donde corresponda.
- **FR-051**: Los correos transaccionales (invitación y recuperación de contraseña) DEBEN mostrarse correctamente en los principales clientes de correo de escritorio y móvil, en modo claro y oscuro, e incluir versión en texto plano.

**Calidad de experiencia**

- **FR-052**: Todas las pantallas de esta feature DEBEN funcionar desde 360 px de ancho y completarse usando solo el teclado (AC-12).

### Key Entities *(include if feature involves data)*

- **Organización**: unidad de aislamiento de datos. Nombre, slug único, tipo (`personal` | `empresa`), sector, zona horaria, estado (activa/suspendida), motivo, fecha y autor de la última suspensión, fechas de creación y actualización.
- **Usuario / Perfil**: persona con cuenta. Correo (único), nombre, zona horaria, marca de superadministrador a nivel plataforma, estado del onboarding (paso actual, completado/saltado), aceptaciones de términos y aviso de IA con versión y fecha (la preferencia de tema se guarda en el dispositivo, FR-038).
- **Pertenencia (membership)**: relación usuario–organización con uno o más roles (`admin_empresa`, `supervisor`, `instructor`, `vendedor`), estado (activa, invitada, suspendida), fecha de invitación y fecha de alta.
- **Invitación**: correo destino, organización y rol(es) destino (en esta etapa, nueva organización personal con rol vendedor), quien invita, fecha de creación, vencimiento, último envío, resultado del envío, estado (pendiente/aceptada/vencida/revocada), fecha de aceptación o revocación, solicitud de acceso de origen (opcional).
- **Equipo**: pertenece a una organización; nombre y responsable (manager). Sin interfaz en esta etapa.
- **Registro de auditoría**: actor, organización (opcional para eventos de plataforma), acción, tipo e identificador del objeto, datos del cambio, resultado, marca de tiempo. Inmutable.
- **Cuota**: por organización; límite diario y mensual de simulaciones, fecha y autor del último cambio.
- **Uso de IA**: por organización; usuario, tarea, modelo, tokens de entrada y salida, latencia, costo estimado, marca de tiempo y referencia opcional a la sesión (sin contenido).
- **Solicitud de acceso**: nombre, correo, empresa u ocupación, mensaje, aceptación de privacidad, estado (nueva/invitada/descartada), invitación vinculada, quién la revisó y cuándo, fecha de descarte, marca y fecha de anonimización. Dato de plataforma (no pertenece a ninguna organización).
- **Documento legal versionado**: términos de uso y aviso de uso de IA, con versión y fecha de vigencia, referenciados por las aceptaciones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un superadministrador crea y envía una invitación en menos de 1 minuto, y el correo llega a la bandeja de destino en menos de 2 minutos en el 95 % de los casos.
- **SC-002**: Una persona invitada pasa de abrir el enlace a estar dentro de la plataforma en menos de 3 minutos, y al menos el 90 % de las personas en pruebas con usuarios lo logra en el primer intento sin ayuda.
- **SC-003**: El 100 % de los intentos de acceso con invitaciones vencidas, revocadas, ya usadas o manipuladas es rechazado con un mensaje claro (AC-02).
- **SC-004**: El 100 % de las pruebas automatizadas de aislamiento entre dos organizaciones pasa: cero lecturas o escrituras cruzadas permitidas (AC-01).
- **SC-005**: El 100 % de los intentos de un superadministrador de usar funciones de administración sin haber verificado el segundo factor es rechazado.
- **SC-006**: Todas las pantallas de la feature se completan a 360 px de ancho y solo con teclado, y la auditoría automatizada de accesibilidad reporta cero violaciones serias o críticas en móvil y escritorio, en ambos temas (AC-12).
- **SC-007**: En la auditoría web estándar de rendimiento y accesibilidad en móvil, la landing, el inicio de sesión y la app shell obtienen Rendimiento ≥ 90 y Accesibilidad = 100.
- **SC-008**: En red móvil 4G, las páginas principales cargan su contenido principal en menos de 2,5 s, sin saltos de diseño perceptibles (desplazamiento acumulado < 0,1).
- **SC-009**: El 100 % de los pares de color de texto e interfaz definidos en los tokens cumple contraste AA en tema claro y oscuro.
- **SC-010**: El 100 % de las acciones auditables listadas (invitaciones, inicios de sesión de superadmin, cambios de cuota, suspensión y reactivación de organizaciones, solicitudes) genera exactamente un registro de auditoría completo.
- **SC-011**: El superadministrador encuentra el consumo de IA y la cuota de cualquier organización en menos de 30 segundos, y ninguna vista disponible expone contenido de conversaciones.
- **SC-012**: El 100 % de los componentes base enumerados está documentado en `/design` con sus variantes y estados en ambos temas.

## Assumptions

- **Primer superadministrador**: las cuentas de superadministrador (equipo Cautiva) se crean mediante un procedimiento operativo interno documentado (no desde la interfaz); la gestión de superadministradores queda fuera de alcance.
- **Superadministrador sin organización**: el rol de superadministrador es de nivel plataforma y no requiere pertenecer a una organización; no puede practicar como vendedor con esa misma cuenta en esta etapa.
- **Roles de la organización personal**: la persona tiene solo el rol `vendedor`; ser "administradora" de su organización personal es implícito por ser su único miembro (tipo `personal`). No se asigna `admin_empresa` en organizaciones personales, para no exigir MFA a cada vendedor individual (la constitución lo exige a todo `admin_empresa`).
- **Plazo de invitación**: configurable por invitación entre 1 y 30 días, con 7 por defecto; no se requiere una configuración global de plataforma.
- **Cuota por defecto**: 10 simulaciones por día y 100 por mes para cada organización nueva, ajustable por el superadministrador; el bloqueo efectivo al agotarse la cuota (AC-07) se implementa en la feature 002.
- **Consumo de IA**: en esta etapa no hay llamadas a IA; el panel de consumo muestra estado vacío o datos de prueba. El costo estimado se expresa en USD (moneda de facturación del proveedor de IA).
- **Textos legales**: Cautiva provee los textos de términos de uso, aviso de uso de IA y política de privacidad; mientras no estén, se usan borradores versionados marcados como tales.
- **Sesión**: persistencia de hasta 30 días con renovación por actividad y cierre tras 7 días de inactividad (12 horas para superadministrador), práctica estándar para SaaS B2B.
- **Recuperación de MFA del superadministrador**: sin autoservicio ni interfaz; solo mediante el procedimiento operativo interno documentado (FR-027a), con auditoría.
- **Cambio de correo, eliminación de cuenta, exportación de datos y gestión de sesiones múltiples**: fuera de alcance en esta etapa.
- **Notificaciones**: las solicitudes de acceso nuevas se ven en la bandeja con contador; no se envía correo al superadministrador en esta etapa.
- **Retención**: las solicitudes de acceso siguen la retención definida en FR-049a; los registros de auditoría se conservan según la política escrita de retención exigida por la constitución (principio II), que debe documentarse en el plan.
- **Herramientas de verificación**: la "auditoría automatizada de accesibilidad" corresponde a axe y la "auditoría web estándar" a Lighthouse en perfil móvil, según la constitución; los mecanismos concretos de aislamiento (políticas a nivel de base de datos), MFA y correo se definen en el plan conforme a las restricciones técnicas de la constitución.
- **Navegadores soportados**: las dos últimas versiones de Chrome, Edge, Safari y Firefox, en escritorio y móvil.
- **Fuera de alcance** (según la descripción): empresas con equipos, invitaciones hechas por un admin de empresa, panel de supervisor, cursos, tutor, pagos, certificados, sitio público completo y SSO corporativo.
- **Dependencia**: la feature 002 (práctica del vendedor) consumirá la organización personal, las cuotas, el registro de uso de IA y la app shell definidos aquí.
