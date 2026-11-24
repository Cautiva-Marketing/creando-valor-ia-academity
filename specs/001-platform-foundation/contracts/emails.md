# Contrato: correos transaccionales y Send Email Hook

## Reglas comunes (FR-012, FR-050, FR-051)

- Plantillas React Email en `src/emails/`; cada envío incluye **HTML y texto plano**.
- Remitente `EMAIL_FROM` (p. ej., `Creando Valor IA <no-responder@dominio>`), idioma `es`,
  `color-scheme: light dark`; colores con contraste AA en ambos modos; contenido legible sin imágenes;
  botón principal + enlace en texto visible como respaldo; ancho máximo 600 px; tipografía de sistema
  con Figtree/Bricolage como preferencia (los clientes que no cargan fuentes web usan el respaldo).
- Pie: "Creando Valor IA™ — Cautiva Marketing", motivo del correo y aviso de que es automático.
- Nunca se registra el enlace ni el token en logs, Sentry ni auditoría.
- Transporte: nodemailer SMTP (`SMTP_HOST|PORT|USER|PASS`): Resend en producción, Mailpit
  en local/CI.
- Clientes objetivo de verificación manual: Gmail (web, Android, iOS), Outlook (web, escritorio),
  Apple Mail (macOS, iOS), en claro y oscuro.

## `InvitationEmail`

| Campo | Valor |
|---|---|
| Asunto | `Te invitamos a Creando Valor IA™` |
| Props | `{ inviterName: string, acceptUrl: string, expiresAt: Date, expiresInDays: number }` |
| Contenido | Saludo; "{inviterName}, del equipo Cautiva, te invita…"; qué es la plataforma (1 frase); botón "Activar mi cuenta"; "Este enlace vence el {fecha es-PE, America/Lima} ({n} días) y solo puede usarse una vez"; aviso de uso de IA breve; "Si no esperabas esta invitación, ignora este correo". |
| URL | `${SITE_URL}/invitacion/${token}` |

## `PasswordRecoveryEmail`

| Campo | Valor |
|---|---|
| Asunto | `Restablece tu contraseña de Creando Valor IA™` |
| Props | `{ resetUrl: string }` |
| Contenido | "Recibimos una solicitud…"; botón "Definir nueva contraseña"; "El enlace vence en 60 minutos y solo puede usarse una vez"; "Si no fuiste tú, ignora este correo: tu contraseña no cambiará". |
| URL | `${SITE_URL}/auth/confirm?token_hash=${token_hash}&type=recovery&next=/restablecer-contrasena` |

## Send Email Hook — `POST /api/auth/send-email`

Configurado en `supabase/config.toml`:

```toml
[auth.hook.send_email]
enabled = true
uri = "env(SEND_EMAIL_HOOK_URI)"     # local: http://host.docker.internal:3000/api/auth/send-email
secrets = "env(SEND_EMAIL_HOOK_SECRET)"
```

**Petición** (de Supabase Auth): cabeceras Standard Webhooks (`webhook-id`, `webhook-timestamp`,
`webhook-signature`) y cuerpo:

```json
{
  "user": { "id": "uuid", "email": "string", "...": "..." },
  "email_data": {
    "token": "string", "token_hash": "string", "redirect_to": "string",
    "email_action_type": "recovery", "site_url": "string",
    "token_new": "string", "token_hash_new": "string"
  }
}
```

**Procesamiento**:

1. Verifica firma con `standardwebhooks` y tolerancia de 5 min; si falla → `401` sin detalles.
1b. Anti-replay: calcula `HMAC(webhook-id)` y consulta el ámbito `webhook_id` (máx. 1 en 24 h); si ya
   existe → `200 {}` sin enviar.
2. Valida el cuerpo con Zod; `email_action_type` distinto de `recovery` → `400` (no soportado en esta
   etapa: registro y cambio de correo están deshabilitados).
3. Rate limit `recovery_email` (3/h por correo): si se excede, responde `200 {}` **sin enviar**
   (Supabase lo considera enviado; el usuario ve la misma confirmación genérica).
4. Renderiza y envía `PasswordRecoveryEmail`; registra los eventos `recovery_email` y `webhook_id`
   (solo tras un envío exitoso, para que Supabase pueda reintentar tras un fallo SMTP).
5. Respuesta `200 {}` en éxito; `500 { "error": { "http_code": 500, "message": "email_send_failed" } }`
   si falla el SMTP (Supabase devuelve error y la UI muestra la confirmación genérica igualmente).

Tiempo objetivo de respuesta < 3 s (límite del hook ≈ 5 s).
