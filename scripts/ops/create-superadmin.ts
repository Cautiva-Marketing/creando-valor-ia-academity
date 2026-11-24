/**
 * Creates a superadmin (T086, scripts/ops/README.md).
 *
 *   pnpm tsx --env-file=<archivo> scripts/ops/create-superadmin.ts \
 *     --email persona@cautiva.pe --full-name "Nombre Apellido" --operator "nombre-operador"
 *
 * The account gets a random password that is never shown nor stored: on first access the person
 * defines it in /recuperar-contrasena and then registers TOTP at /mfa/registrar.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { adminClient, fail, normalizeEmail, targetLabel } from './lib';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    'full-name': { type: 'string' },
    operator: { type: 'string' },
  },
});

const email = values.email ? normalizeEmail(values.email) : '';
const fullName = values['full-name']?.trim() ?? '';
const operator = values.operator?.trim() ?? '';
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Indica --email con un correo válido.');
if (fullName.length < 1 || fullName.length > 80) fail('Indica --full-name (1 a 80 caracteres).');
if (operator.length < 1 || operator.length > 80) fail('Indica --operator (quién ejecuta el alta).');

const admin = adminClient();
console.warn(`Proyecto: ${targetLabel()}`);

const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password: randomBytes(32).toString('base64url'),
  email_confirm: true,
});
if (error || !created.user) fail(`No se pudo crear el usuario: ${error?.message ?? 'sin datos'}`);
const userId = created.user.id;

const profile = await admin
  .from('profiles')
  .update({ full_name: fullName, onboarding_status: 'completed' })
  .eq('user_id', userId);
if (profile.error) fail(`No se pudo actualizar el perfil: ${profile.error.message}`);

const platformAdmin = await admin
  .from('platform_admins')
  .insert({ user_id: userId, created_by_label: operator });
if (platformAdmin.error) fail(`No se pudo registrar el superadmin: ${platformAdmin.error.message}`);

console.warn(`Superadmin creado (user_id ${userId}).`);
console.warn(
  'Siguiente paso: la persona define su contraseña en /recuperar-contrasena y registra TOTP.',
);
