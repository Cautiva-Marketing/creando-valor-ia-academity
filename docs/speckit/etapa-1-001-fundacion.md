# Prompt · /speckit-specify · Etapa 1 · 001-fundacion-plataforma

> Uso: copia el bloque y pégalo después del comando indicado en Claude Code.

```text
Feature: Fundación de la plataforma Creando Valor IA™ (design system, acceso por invitación, organización personal y base multiempresa).

CONTEXTO: primera entrega del SaaS descrito en docs/Creando_Valor_IA_Documento_Maestro_Programador.pdf. Esta feature deja lista la base sobre la que se construye la práctica del vendedor (feature 002) y, más adelante, empresas y equipos. La referencia visual es el prototipo https://cvia.idw.com.pe/: refinar su identidad (tinta verde, acento ají, Bricolage Grotesque + Figtree) y superar su UX.

ACTORES: Superadministrador (equipo Cautiva), Vendedor individual (usuario invitado). Los demás roles (admin_empresa, supervisor, instructor) existen en el modelo, pero no tienen interfaz en esta etapa.

HISTORIAS DE USUARIO:
1. Como superadministrador invito por correo a una persona para que use la plataforma como vendedor individual; la invitación vence en un plazo configurable (por defecto 7 días), puedo reenviarla o revocarla y veo su estado (pendiente, aceptada, vencida, revocada).
2. Como persona invitada abro el enlace, defino mi nombre y contraseña segura, acepto términos y aviso de uso de IA, y entro a la plataforma. Se crea automáticamente mi organización personal y quedo como su vendedor y administrador. Una invitación vencida o revocada no permite el acceso y muestra un mensaje claro (AC-02).
3. Como usuario inicio y cierro sesión, recupero mi contraseña por correo y mi sesión persiste entre visitas. Nadie puede registrarse sin invitación.
4. Como superadministrador inicio sesión con MFA obligatorio (TOTP).
5. Como vendedor completo un onboarding breve de 3 pasos o menos (bienvenida, cómo funciona la práctica, primer paso sugerido) que puedo saltar y retomar.
6. Como usuario navego una app shell consistente: barra superior con marca, navegación principal (en móvil, barra inferior o menú accesible), menú de cuenta con perfil, tema claro/oscuro/sistema y cierre de sesión.
7. Como vendedor edito mi perfil (nombre, avatar con iniciales, zona horaria).
8. Como superadministrador configuro la cuota de simulaciones de cada organización (por día y por mes) y veo el consumo de IA agregado por organización (simulaciones, tokens y costo estimado) sin acceder al contenido de las conversaciones.
9. Como visitante veo una landing pública mínima que explica la propuesta ("Practica la venta antes de hacerla de verdad"), con un formulario de "Solicitar acceso" que guarda la solicitud para que el superadmin la revise y pueda convertirla en invitación.

REQUISITOS FUNCIONALES CLAVE:
- Modelo multiempresa completo desde ya: organizations (con tipo personal | empresa, slug, sector, zona horaria, estado), memberships (usuario-organización-rol, estado, invited_at), invitations, teams (sin UI), audit_logs, ai_usage y quotas. Toda tabla de negocio con organization_id y RLS.
- Autorización en servidor en cada operación más RLS; pruebas que demuestren que un usuario de la organización A no puede leer ni escribir datos de la organización B (AC-01).
- Auditoría de: invitaciones (creación, reenvío, revocación, aceptación), inicios de sesión de superadmin, cambios de cuota.
- Design system documentado (página interna /design accesible solo para el superadmin): tokens de color semánticos (primario, acento, éxito, advertencia, error, superficies) en claro y oscuro, escala tipográfica, espaciado, radios, elevación, motion; componentes base: botón (variantes y tamaños), input, textarea autoajustable, select, checkbox, radio, switch, tag/badge, card, tabla responsive, tabs, diálogo, sheet o bottom-sheet móvil, toast, tooltip, skeleton, empty state, barra de progreso, gauge, anillo de puntaje, avatar, menú.
- Estados vacío, carga, error y sin permiso en todas las pantallas; página 404 y página de error amigables.
- Correos transaccionales (invitación y recuperación de contraseña) con la marca y en español.

FUERA DE ALCANCE: empresas con equipos, invitaciones hechas por un admin de empresa, panel de supervisor, cursos, tutor, pagos, certificados, sitio público completo, SSO corporativo.

CRITERIOS DE ACEPTACIÓN:
- Una invitación vencida o revocada no permite el acceso (AC-02).
- Las pruebas automatizadas de aislamiento entre dos organizaciones pasan (AC-01).
- Todas las pantallas funcionan a 360 px de ancho y solo con teclado, y pasan axe sin violaciones serias (AC-12).
- El superadmin no puede entrar sin MFA.
- Lighthouse en móvil: Performance 90 o más, Accessibility 100 en landing, login y app shell.
- El tema oscuro y el claro cumplen contraste AA.
```
