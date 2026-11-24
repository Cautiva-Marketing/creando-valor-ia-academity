import 'server-only';
import type { ReactElement } from 'react';
import { render } from 'react-email';
import { serverEnv } from '@/lib/env';
import { getTransport } from './transport';

export interface EmailMessage {
  to: string;
  subject: string;
  react: ReactElement;
}

/** Renders a React Email template to HTML and plain text (FR-051). */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

export class EmailSendError extends Error {
  constructor(reason: string) {
    super(`email_send_failed:${reason}`);
    this.name = 'EmailSendError';
  }
}

/**
 * Sends an email. Never logs the recipient, URLs or tokens. With the test-only
 * E2E_EMAIL_FAIL_DOMAIN, recipients of that domain simulate an SMTP failure.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const env = serverEnv();
  const failDomain = env.E2E_EMAIL_FAIL_DOMAIN?.toLowerCase();
  if (failDomain && message.to.toLowerCase().endsWith(`@${failDomain}`)) {
    throw new EmailSendError('simulated');
  }
  const { html, text } = await renderEmail(message.react);
  try {
    await getTransport().sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html,
      text,
      headers: { 'Content-Language': 'es' },
    });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'smtp';
    throw new EmailSendError(code);
  }
}
