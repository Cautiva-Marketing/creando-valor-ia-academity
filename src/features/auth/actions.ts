'use server';

import { redirect } from 'next/navigation';
import { fail, ok, rateLimited, unexpected, type ActionResult } from '@/lib/action-result';
import type { RequestContext } from '@/lib/auth/context-types';
import { destinationFor } from '@/lib/auth/destination';
import { authenticateAction } from '@/lib/auth/guards';
import { publicEnv } from '@/lib/env.public';
import { checkPasswordPolicy } from '@/lib/security/password-policy';
import {
  checkRateLimit,
  getClientIp,
  normalizeEmailKey,
  recordRateLimitEvent,
} from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { isRecoverySession } from './recovery-session';
import {
  fieldErrorsOf,
  formValues,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
} from './schemas';

/**
 * Authentication Server Actions (contracts/server-actions.md → "Autenticación y cuenta").
 * Public actions: rate limit → Zod → operation → redirect. `signOut` is the only action without a
 * rate limit.
 */

export async function signIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formValues(formData, ['email', 'password', 'next']);
  const emailKey = normalizeEmailKey(raw.email ?? '');
  const values = { email: raw.email ?? '' };
  let destination: string;
  try {
    const ip = await getClientIp();
    // 1. Rate limit (consulted before Auth; only failures record events).
    const [account, address] = await Promise.all([
      emailKey
        ? checkRateLimit('login_account', emailKey)
        : { allowed: true, retryAfterSeconds: 0 },
      checkRateLimit('login_ip', ip),
    ]);
    if (!account.allowed || !address.allowed) {
      return {
        ...rateLimited(Math.max(account.retryAfterSeconds, address.retryAfterSeconds)),
        values,
      };
    }

    // 2. Validation.
    const parsed = signInSchema.safeParse(raw);
    if (!parsed.success)
      return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });

    // 3. Operation.
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      await Promise.all([
        recordRateLimitEvent('login_account', parsed.data.email),
        recordRateLimitEvent('login_ip', ip),
      ]);
      // Same generic message for unknown email and wrong password (FR-018).
      return fail('unauthorized', { values });
    }

    // 4. Memberships / superadmin → destination (contracts/routes.md).
    const { data: ctx, error: ctxError } = await supabase.rpc('get_request_context');
    if (ctxError || !ctx)
      throw new Error(`request context unavailable (${ctxError?.code ?? 'no data'})`);
    destination = destinationFor(ctx as unknown as RequestContext, parsed.data.next);
  } catch (error) {
    return { ...unexpected(error, 'signIn'), values };
  }
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/iniciar-sesion');
}

/** Always answers with the same confirmation (FR-020); the hook records the recovery_email event. */
export async function requestPasswordReset(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formValues(formData, ['email']);
  const emailKey = normalizeEmailKey(raw.email ?? '');
  try {
    const limit = emailKey ? await checkRateLimit('recovery_email', emailKey) : { allowed: true };
    const parsed = requestPasswordResetSchema.safeParse(raw);
    if (!parsed.success) {
      return fail('validation', {
        fieldErrors: fieldErrorsOf(parsed.error),
        values: { email: raw.email ?? '' },
      });
    }
    if (limit.allowed) {
      const supabase = await createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: new URL('/auth/confirm', publicEnv().NEXT_PUBLIC_SITE_URL).toString(),
      });
      // Errors (e.g. SMTP failure in the hook) never change the answer.
      if (error) console.warn(`requestPasswordReset: auth error ${error.status ?? ''}`);
    }
  } catch (error) {
    unexpected(error, 'requestPasswordReset');
  }
  return ok();
}

export async function resetPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Guard: session (recovery) + user_mutation.
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const ctx = auth.ctx;
  let destination: string;
  try {
    const supabase = await createClient();
    if (!(await isRecoverySession(supabase))) {
      return fail('unauthorized', {
        message: 'El enlace para restablecer tu contraseña ya no es válido. Pide uno nuevo.',
      });
    }
    const parsed = resetPasswordSchema.safeParse(formValues(formData, ['password']));
    if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

    const policy = await checkPasswordPolicy(parsed.data.password, ctx.email);
    if (!policy.ok) return fail('validation', { fieldErrors: { password: policy.messages } });

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      if (error.code === 'same_password') {
        return fail('validation', {
          fieldErrors: { password: ['Usa una contraseña distinta de la anterior.'] },
        });
      }
      if (error.code === 'weak_password') {
        return fail('validation', {
          fieldErrors: { password: ['Elige una contraseña más segura.'] },
        });
      }
      throw new Error(`updateUser failed (${error.code ?? error.status})`);
    }
    // FR-021: every other session ends.
    await supabase.auth.signOut({ scope: 'others' });
    destination = destinationFor(ctx);
  } catch (error) {
    return unexpected(error, 'resetPassword');
  }
  redirect(destination);
}
