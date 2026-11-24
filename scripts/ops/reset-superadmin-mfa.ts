/**
 * Resets a superadmin's MFA (T087, FR-027a, scripts/ops/README.md).
 *
 *   pnpm tsx --env-file=<archivo> scripts/ops/reset-superadmin-mfa.ts \
 *     --email persona@cautiva.pe --operator "nombre-operador"
 *
 * Deletes every factor, revokes every session and audits `superadmin.mfa_reset`
 * (actor_type = operator, actor_label = operator, data = { sessions_revoked }).
 */
import { parseArgs } from 'node:util';
import { adminClient, fail, normalizeEmail, targetLabel } from './lib';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    operator: { type: 'string' },
  },
});

const email = values.email ? normalizeEmail(values.email) : '';
const operator = values.operator?.trim() ?? '';
if (!email) fail('Indica --email del superadmin.');
if (operator.length < 1 || operator.length > 80)
  fail('Indica --operator (quién ejecuta el reset).');

const admin = adminClient();
console.warn(`Proyecto: ${targetLabel()}`);

const { data: profile, error: profileError } = await admin
  .from('profiles')
  .select('user_id')
  .eq('email', email)
  .maybeSingle();
if (profileError) fail(`No se pudo buscar el usuario: ${profileError.message}`);
if (!profile) fail('No existe un usuario con ese correo.');
const userId = profile.user_id;

const { data: platformAdmin } = await admin
  .from('platform_admins')
  .select('user_id')
  .eq('user_id', userId)
  .maybeSingle();
if (!platformAdmin)
  fail('El usuario no es superadmin: este procedimiento solo aplica a superadmins.');

const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
if (listError) fail(`No se pudieron listar los factores: ${listError.message}`);
for (const factor of factors?.factors ?? []) {
  const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
  if (error) fail(`No se pudo eliminar un factor: ${error.message}`);
}

const { data: revoked, error: revokeError } = await admin.rpc('revoke_user_sessions', {
  p_user_id: userId,
});
if (revokeError) fail(`No se pudieron revocar las sesiones: ${revokeError.code}`);

const { error: auditError } = await admin.rpc('write_audit', {
  p_actor_type: 'operator',
  p_actor_user_id: null as unknown as string,
  p_actor_label: operator,
  p_org: null as unknown as string,
  p_action: 'superadmin.mfa_reset',
  p_object_type: 'user',
  p_object_id: userId,
  p_data: { sessions_revoked: revoked ?? 0 },
  p_result: 'success',
});
if (auditError)
  fail(`MFA reseteado pero la auditoría falló (${auditError.code}): regístralo manualmente.`);

console.warn(
  `MFA reseteado (user_id ${userId}): ${factors?.factors.length ?? 0} factor(es) eliminados, ${revoked ?? 0} sesión(es) revocadas.`,
);
