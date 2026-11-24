'use server';

import { redirect } from 'next/navigation';
import { fail, ok, rateLimited, unexpected, type ActionResult } from '@/lib/action-result';
import { writeAudit } from '@/lib/audit';
import type { RequestContext } from '@/lib/auth/context-types';
import { authenticateAction } from '@/lib/auth/guards';
import { safeNext } from '@/lib/auth/safe-next';
import { checkRateLimit, recordRateLimitEvent } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { confirmMfaEnrollmentSchema, verifyMfaSchema } from './mfa-schemas';
import { fieldErrorsOf, formValues } from './schemas';

/**
 * Superadmin TOTP (contracts/server-actions.md → enrollMfa / confirmMfaEnrollment / verifyMfa).
 * The TOTP secret is shown only on screen and is never logged or audited.
 */

const WRONG_CODE =
  'El código no es correcto o ya venció. Revisa tu app de autenticación e inténtalo de nuevo.';
const ISSUER = 'Creando Valor IA';

export interface EnrollmentData {
  factorId: string;
  qrSvg: string;
  secret: string;
}

function needsEnrollment(ctx: RequestContext): boolean {
  return ctx.is_superadmin_account && ctx.aal === 'aal1' && !ctx.has_verified_factor;
}

function needsVerification(ctx: RequestContext): boolean {
  return ctx.is_superadmin_account && ctx.aal === 'aal1' && ctx.has_verified_factor;
}

async function auditLogin(
  ctx: RequestContext,
  step: 'mfa_verify' | 'mfa_enroll',
  result: 'success' | 'failure',
) {
  await writeAudit({
    action: 'superadmin.login',
    actorType: 'user',
    actorUserId: ctx.user_id,
    objectType: 'user',
    objectId: ctx.user_id,
    data: { step },
    result,
  });
}

/** Starts TOTP enrollment for a superadmin without a verified factor. */
export async function enrollMfa(): Promise<ActionResult<EnrollmentData>> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  if (!needsEnrollment(auth.ctx)) return fail('forbidden');
  try {
    const supabase = await createClient();
    // Discard abandoned, unverified factors so the user never accumulates them.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: ISSUER });
    if (error || !data) throw new Error(`mfa enroll failed (${error?.code ?? 'no data'})`);
    return ok({ factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret });
  } catch (error) {
    return unexpected(error, 'enrollMfa');
  }
}

export async function confirmMfaEnrollment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const ctx = auth.ctx;
  if (!needsEnrollment(ctx)) return fail('forbidden');
  try {
    const limit = await checkRateLimit('mfa_verify', ctx.user_id);
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

    const parsed = confirmMfaEnrollmentSchema.safeParse(formValues(formData, ['factorId', 'code']));
    if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: parsed.data.factorId,
      code: parsed.data.code,
    });
    if (error) {
      await Promise.all([
        recordRateLimitEvent('mfa_verify', ctx.user_id),
        auditLogin(ctx, 'mfa_enroll', 'failure'),
      ]);
      return fail('validation', { fieldErrors: { code: [WRONG_CODE] } });
    }
    await writeAudit({
      action: 'superadmin.mfa_enrolled',
      actorType: 'user',
      actorUserId: ctx.user_id,
      objectType: 'user',
      objectId: ctx.user_id,
      data: {},
    });
    await auditLogin(ctx, 'mfa_enroll', 'success');
  } catch (error) {
    return unexpected(error, 'confirmMfaEnrollment');
  }
  redirect('/admin/invitaciones');
}

export async function verifyMfa(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const ctx = auth.ctx;
  if (!needsVerification(ctx)) return fail('forbidden');
  let destination: string;
  try {
    const limit = await checkRateLimit('mfa_verify', ctx.user_id);
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

    const parsed = verifyMfaSchema.safeParse(formValues(formData, ['code', 'next']));
    if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

    const supabase = await createClient();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === 'verified');
    if (listError || !factor) throw new Error(`no verified factor (${listError?.code ?? 'none'})`);

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: parsed.data.code,
    });
    if (error) {
      await Promise.all([
        recordRateLimitEvent('mfa_verify', ctx.user_id),
        auditLogin(ctx, 'mfa_verify', 'failure'),
      ]);
      return fail('validation', { fieldErrors: { code: [WRONG_CODE] } });
    }
    await auditLogin(ctx, 'mfa_verify', 'success');
    destination = safeNext(parsed.data.next) ?? '/admin/invitaciones';
  } catch (error) {
    return unexpected(error, 'verifyMfa');
  }
  redirect(destination);
}
