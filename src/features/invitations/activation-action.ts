'use server';

import { redirect } from 'next/navigation';
import {
  fail,
  rateLimited,
  unexpected,
  type ActionResult,
  type ActionFailure,
} from '@/lib/action-result';
import { checkPasswordPolicy } from '@/lib/security/password-policy';
import { consumeRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { hashTokenHex } from '@/lib/security/tokens';
import { createAdminClient, type AdminSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsOf, formValues } from '@/features/auth/schemas';
import { getCurrentLegalDocuments } from '@/features/legal/queries';
import { activateAccountSchema } from './activation-schema';
import { invitationStatusOf } from './queries';

/**
 * activateAccount (contracts/server-actions.md; research.md §R4):
 * activation_ip → Zod + password policy → invitation → current legal versions → createUser (or reuse
 * an orphan account) → accept_invitation (compensating if it fails) → signIn → /onboarding.
 */

export type InvitationInvalidReason = 'expired' | 'revoked' | 'used' | 'invalid';

const LEGAL_OUTDATED =
  'Los términos o el aviso de uso de IA se actualizaron: revísalos y acéptalos de nuevo.';

const INVALID_MESSAGES: Record<InvitationInvalidReason, string> = {
  expired: 'Esta invitación venció.',
  revoked: 'Esta invitación fue revocada.',
  used: 'Esta invitación ya fue usada.',
  invalid: 'Este enlace de invitación no es válido.',
};

function invitationInvalid(reason: InvitationInvalidReason): ActionFailure {
  return fail('invitation_invalid', { message: INVALID_MESSAGES[reason], details: { reason } });
}

function legalOutdated(fullName: string): ActionFailure {
  return fail('validation', { fieldErrors: { legal: [LEGAL_OUTDATED] }, values: { fullName } });
}

/** Orphan account: no memberships, not superadmin, no accepted invitation (data-model.md). */
async function isOrphan(admin: AdminSupabase, userId: string): Promise<boolean> {
  const [memberships, admins, accepted] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin
      .from('platform_admins')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId),
    admin
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('accepted_user_id', userId),
  ]);
  for (const r of [memberships, admins, accepted]) {
    if (r.error) throw new Error(`orphan check failed (${r.error.code})`);
  }
  return (memberships.count ?? 0) === 0 && (admins.count ?? 0) === 0 && (accepted.count ?? 0) === 0;
}

/** Deletes the user created by this request only if it is still an orphan. */
async function compensate(admin: AdminSupabase, userId: string): Promise<void> {
  try {
    const { count } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) === 0) await admin.auth.admin.deleteUser(userId);
  } catch (error) {
    // Provider messages may echo the email: report to Sentry (scrubbed) and log only a reference.
    unexpected(error, 'activateAccount.compensate');
  }
}

export async function activateAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formValues(formData, [
    'token',
    'fullName',
    'password',
    'acceptTerms',
    'acceptAiNotice',
    'termsDocumentId',
    'aiNoticeDocumentId',
  ]);
  const values = { fullName: raw.fullName ?? '' };

  try {
    // 1. Rate limit (every activation attempt counts).
    const limit = await consumeRateLimit('activation_ip', await getClientIp());
    if (!limit.allowed) return { ...rateLimited(limit.retryAfterSeconds), values };

    // 2. Zod.
    const parsed = activateAccountSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error);
      if (fieldErrors.token) return invitationInvalid('invalid');
      return fail('validation', { fieldErrors, values });
    }
    const input = parsed.data;
    values.fullName = input.fullName;

    // 3. Invitation (pending and not expired).
    const admin = createAdminClient();
    const tokenHash = hashTokenHex(input.token);
    const { data: invitation, error: invitationError } = await admin
      .from('invitations')
      .select('email, expires_at, accepted_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (invitationError) throw new Error(`invitation lookup failed (${invitationError.code})`);
    if (!invitation) return invitationInvalid('invalid');
    const status = invitationStatusOf(invitation);
    if (status !== 'pending') return invitationInvalid(status === 'accepted' ? 'used' : status);

    // 4. Password policy (FR-014, includes "different from the email" and HIBP).
    const policy = await checkPasswordPolicy(input.password, invitation.email);
    if (!policy.ok)
      return fail('validation', { fieldErrors: { password: policy.messages }, values });

    // 5. Legal versions the person saw must still be the current ones (FR-015).
    const legal = await getCurrentLegalDocuments();
    if (
      input.termsDocumentId !== legal.terms?.id ||
      input.aiNoticeDocumentId !== legal.ai_notice?.id
    ) {
      return legalOutdated(input.fullName);
    }

    // 6. Account: create, or reuse an orphan account with the invitation's email.
    let userId: string;
    let created = false;
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: invitation.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (createdUser.user) {
      userId = createdUser.user.id;
      created = true;
    } else if (createError?.code === 'email_exists' || createError?.status === 422) {
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('user_id')
        .eq('email', invitation.email)
        .maybeSingle();
      if (profileError) throw new Error(`profile lookup failed (${profileError.code})`);
      if (!profile)
        throw new Error(`createUser failed (${createError.code ?? createError.status})`);
      if (!(await isOrphan(admin, profile.user_id))) {
        return fail('conflict', {
          message: 'Ya existe una cuenta con este correo. Inicia sesión para continuar.',
          details: { reason: 'account_exists' },
        });
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(profile.user_id, {
        password: input.password,
      });
      if (updateError)
        throw new Error(`orphan reuse failed (${updateError.code ?? updateError.status})`);
      userId = profile.user_id;
    } else if (createError?.code === 'weak_password') {
      return fail('validation', {
        fieldErrors: { password: ['Elige una contraseña más segura.'] },
        values,
      });
    } else {
      throw new Error(
        `createUser failed (${createError?.code ?? createError?.status ?? 'no user'})`,
      );
    }

    // 7. Atomic acceptance; compensate only for a user created in this request.
    const { error: acceptError } = await admin.rpc('accept_invitation', {
      p_token_hash: tokenHash,
      p_user_id: userId,
      p_full_name: input.fullName,
      p_terms_doc: input.termsDocumentId,
      p_ai_notice_doc: input.aiNoticeDocumentId,
    });
    if (acceptError) {
      if (created) await compensate(admin, userId);
      if (acceptError.code === 'P0011') {
        const detail = acceptError.details ?? 'invalid';
        if (detail === 'legal_outdated') return legalOutdated(input.fullName);
        if (detail === 'expired' || detail === 'revoked' || detail === 'used')
          return invitationInvalid(detail);
        return invitationInvalid('invalid');
      }
      throw new Error(`accept_invitation failed (${acceptError.code})`);
    }

    // 8. Session.
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: invitation.email,
      password: input.password,
    });
    if (signInError)
      throw new Error(`post-activation sign-in failed (${signInError.code ?? signInError.status})`);
  } catch (error) {
    return { ...unexpected(error, 'activateAccount'), values };
  }
  redirect('/onboarding');
}
