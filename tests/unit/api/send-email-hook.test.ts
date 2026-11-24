import { Webhook } from 'standardwebhooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkRateLimit = vi.fn();
const recordRateLimitEvent = vi.fn();
const sendEmail = vi.fn();

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit,
  recordRateLimitEvent,
  normalizeEmailKey: (email: string) => email.trim().toLowerCase(),
}));
vi.mock('@/lib/email/send', async () => {
  class EmailSendError extends Error {}
  return { sendEmail, EmailSendError };
});
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const { POST } = await import('@/app/api/auth/send-email/route');
const { EmailSendError } = await import('@/lib/email/send');

const secret = process.env.SEND_EMAIL_HOOK_SECRET!.replace('v1,whsec_', '');
const webhook = new Webhook(secret);

function body(type = 'recovery') {
  return JSON.stringify({
    user: { id: '00000000-0000-4000-a000-000000000099', email: 'Ana@Ejemplo.test' },
    email_data: {
      token: '123456',
      token_hash: 'pkce_abc123',
      redirect_to: 'http://localhost:3000/auth/confirm',
      email_action_type: type,
      site_url: 'http://localhost:3000',
      token_new: '',
      token_hash_new: '',
    },
  });
}

function signedRequest(payload: string, { id = 'msg_1', at = new Date(), sign = webhook } = {}) {
  const signature = sign.sign(id, at, payload);
  return new Request('http://localhost:3000/api/auth/send-email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': Math.floor(at.getTime() / 1000).toString(),
      'webhook-signature': signature,
    },
    body: payload,
  });
}

const allowed = { allowed: true, retryAfterSeconds: 0 };
const blocked = { allowed: false, retryAfterSeconds: 600 };

describe('POST /api/auth/send-email (contracts/emails.md)', () => {
  beforeEach(() => {
    checkRateLimit.mockReset().mockResolvedValue(allowed);
    recordRateLimitEvent.mockReset().mockResolvedValue(undefined);
    sendEmail.mockReset().mockResolvedValue(undefined);
  });

  it('401 for an invalid signature', async () => {
    const response = await POST(
      signedRequest(body(), { sign: new Webhook('b3RoZXItc2VjcmV0LW90aGVyLXNlY3JldA==') }),
    );
    expect(response.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('401 for a timestamp older than 5 minutes', async () => {
    const response = await POST(signedRequest(body(), { at: new Date(Date.now() - 6 * 60_000) }));
    expect(response.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('400 for an email type other than recovery', async () => {
    const response = await POST(signedRequest(body('signup')));
    expect(response.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('200 without sending nor recording when recovery_email is exceeded', async () => {
    checkRateLimit.mockImplementation(async (scope: string) =>
      scope === 'recovery_email' ? blocked : allowed,
    );
    const response = await POST(signedRequest(body()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordRateLimitEvent).not.toHaveBeenCalled();
  });

  it('200 on success: sends once and records exactly one recovery_email event', async () => {
    const response = await POST(signedRequest(body()));
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0]![0] as { to: string; subject: string };
    expect(message.to).toBe('ana@ejemplo.test');
    expect(message.subject).toBe('Restablece tu contraseña de Creando Valor IA™');
    expect(checkRateLimit).toHaveBeenCalledWith('recovery_email', 'ana@ejemplo.test');
    const recovery = recordRateLimitEvent.mock.calls.filter(
      ([scope]) => scope === 'recovery_email',
    );
    expect(recovery).toEqual([['recovery_email', 'ana@ejemplo.test']]);
    expect(recordRateLimitEvent).toHaveBeenCalledWith('webhook_id', 'msg_1');
  });

  it('same webhook-id twice: the second answers 200 without sending', async () => {
    checkRateLimit.mockImplementation(async (scope: string) =>
      scope === 'webhook_id' ? blocked : allowed,
    );
    const response = await POST(signedRequest(body(), { id: 'msg_dup' }));
    expect(response.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith('webhook_id', 'msg_dup');
  });

  it('500 with the contract body when SMTP fails, recording nothing', async () => {
    sendEmail.mockRejectedValue(new EmailSendError('smtp'));
    const response = await POST(signedRequest(body()));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { http_code: 500, message: 'email_send_failed' },
    });
    expect(recordRateLimitEvent).not.toHaveBeenCalled();
  });
});
