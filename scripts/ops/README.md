# Procedimientos operativos de superadmin

Scripts para dar de alta superadministradores y resetear su MFA (FR-027a). Usan la **clave secreta**
de Supabase: solo los ejecutan las personas responsables de la plataforma en Cautiva Marketing, desde
un equipo de confianza y nunca desde CI de producción.

## Quién puede ejecutarlos

- Responsables técnicos de la plataforma con acceso a la clave secreta del proyecto (Supabase →
  Project Settings → API keys).
- Cada ejecución identifica a quien la hace con `--operator` (nombre o alias). Ese valor queda en la
  auditoría (`audit_logs.actor_label`) o en `platform_admins.created_by_label`.

## Variables

Los scripts **no leen ningún archivo por su cuenta**: la configuración llega solo del entorno, para
que nunca apunten al proyecto equivocado por accidente.

| Variable                   | Valor                                          |
| -------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto (local o producción)          |
| `SUPABASE_SECRET_KEY`      | Clave secreta `sb_secret_…` del mismo proyecto |

Recomendado: un archivo fuera del repositorio (p. ej. `~/.cautiva/production.env`) y `--env-file`:

```bash
pnpm tsx --env-file=$HOME/.cautiva/production.env scripts/ops/<script>.ts ...
```

Cada script imprime el host del proyecto (`Proyecto: …`) antes de actuar: compruébalo.

## Alta de un superadmin

```bash
pnpm tsx --env-file=<archivo> scripts/ops/create-superadmin.ts \
  --email persona@cautiva.pe --full-name "Nombre Apellido" --operator "tu-nombre"
```

1. Crea el usuario confirmado con una contraseña aleatoria que **no se muestra ni se guarda**.
2. Completa `profiles.full_name` y crea la fila de `platform_admins` con
   `created_by_label = --operator`.
3. **Primer acceso** de la persona:
   1. Va a `/recuperar-contrasena`, escribe su correo y define su contraseña con el enlace recibido.
   2. Inicia sesión y es llevada a `/mfa/registrar`: escanea el QR (o escribe la clave manual) en su
      app de autenticación y confirma con un código de 6 dígitos.
   3. Desde ese momento cada inicio de sesión exige el código (`/mfa/verificar`).

Verificación:

```sql
select user_id, created_by_label, created_at from public.platform_admins order by created_at desc limit 5;
```

## Reset de MFA (pérdida del dispositivo)

Antes de ejecutarlo, **verifica la identidad** de la persona por un canal distinto del correo (p. ej.
videollamada o llamada a un número conocido).

```bash
pnpm tsx --env-file=<archivo> scripts/ops/reset-superadmin-mfa.ts \
  --email persona@cautiva.pe --operator "tu-nombre"
```

1. Comprueba que el correo pertenece a un superadmin (si no, se detiene sin cambios).
2. Elimina todos sus factores TOTP.
3. Revoca todas sus sesiones (`revoke_user_sessions`): cualquier sesión abierta se rechaza en su
   siguiente petición.
4. Audita `superadmin.mfa_reset` con `actor_type = operator`, `actor_label = --operator` y
   `{ sessions_revoked }`.
5. En su siguiente inicio de sesión la persona debe registrar un factor nuevo en `/mfa/registrar`.

Verificación en `audit_logs`:

```sql
select created_at, actor_type, actor_label, object_id, data
  from public.audit_logs
 where action = 'superadmin.mfa_reset'
 order by created_at desc
 limit 5;
```

Si el script informa que la auditoría falló después del reset, registra el incidente manualmente
(fecha, operador, usuario) y avisa al resto del equipo.

## Despachador de evaluaciones (Vault)

`private.run_practice_maintenance()` envía cada minuto, con `pg_net`, las evaluaciones `pending`
que el disparo inmediato no tomó. La URL de la app y el secreto Bearer viven **solo** en Supabase
Vault (`practice_dispatch_url`, `practice_dispatch_secret`); localmente los carga `supabase/seed.sql`
y en producción este script (únicamente con aprobación explícita, como parte de la salida a
producción):

```bash
pnpm tsx --env-file=<archivo> scripts/ops/set-practice-dispatch.ts --project-ref <ref>
```

Variables: `SUPABASE_ACCESS_TOKEN` (token personal de la Management API), `SUPABASE_PROJECT_REF`
(debe coincidir con `--project-ref`), `PRACTICE_DISPATCH_URL` (origen `https` de la app, sin ruta) y
`PRACTICE_DISPATCH_SECRET` (≥ 32 bytes, el mismo valor que la variable de Vercel). El script crea o
actualiza ambos secretos y nunca imprime el token ni el secreto.

Verificación (en el SQL editor):

```sql
select status_code, created from net._http_response order by created desc limit 5; -- 202 esperados
select status, return_message, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'practice-maintenance')
 order by start_time desc limit 5;
```
