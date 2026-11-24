import * as Sentry from '@sentry/nextjs';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';
import PasswordRecoveryEmail, { PASSWORD_RECOVERY_SUBJECT } from '@/emails/password-recovery';
import { EmailSendError, sendEmail } from '@/lib/email/send';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/env.public';
import { checkRateLimit, normalizeEmailKey, recordRateLimitEvent } from '@/lib/security/rate-limit';

/**
 * Supabase Auth Send Email Hook (contracts/emails.md). Only `recovery` is supported in this stage.
 * Never logs the recipient, the link or the token.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  user: z.object({ id: z.string(), email: z.email() }),
  email_data: z.object({
    token_hash: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
    email_action_type: z.string(),
  }),
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const SEND_FAILED = { error: { http_code: 500, message: 'email_send_failed' } };

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  // 1. Standard Webhooks signature, 5-minute tolerance (library default).
  let body: unknown;
  try {
    body = new Webhook(serverEnv().SEND_EMAIL_HOOK_SECRET.replace(/^v1,whsec_/, '')).verify(
      payload,
      headers,
    );
  } catch {
    return json(401, {});
  }

  try {
    // 1b. Anti-replay by webhook-id (max 1 per 24 h).
    const webhookId = headers['webhook-id'] ?? '';
    if (!(await checkRateLimit('webhook_id', webhookId)).allowed) return json(200, {});

    // 2. Body validation; only recovery.
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success || parsed.data.email_data.email_action_type !== 'recovery') {
      return json(400, { error: { http_code: 400, message: 'unsupported_email_action' } });
    }
    const email = normalizeEmailKey(parsed.data.user.email);

    // 3. recovery_email limit (3/h): over the limit → 200 without sending.
    if (!(await checkRateLimit('recovery_email', email)).allowed) return json(200, {});

    // 4. Render + send; events only after a successful send (Supabase can retry after SMTP errors).
    const resetUrl = new URL('/auth/confirm', publicEnv().NEXT_PUBLIC_SITE_URL);
    resetUrl.searchParams.set('token_hash', parsed.data.email_data.token_hash);
    resetUrl.searchParams.set('type', 'recovery');
    resetUrl.searchParams.set('next', '/restablecer-contrasena');
    await sendEmail({
      to: email,
      subject: PASSWORD_RECOVERY_SUBJECT,
      react: PasswordRecoveryEmail({ resetUrl: resetUrl.toString() }),
    });
    await Promise.all([
      recordRateLimitEvent('recovery_email', email),
      recordRateLimitEvent('webhook_id', webhookId),
    ]);
    return json(200, {});
  } catch (error) {
    if (!(error instanceof EmailSendError)) Sentry.captureException(error);
    else console.warn('send-email hook: email_send_failed');
    return json(500, SEND_FAILED);
  }
}
