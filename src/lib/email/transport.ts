import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { serverEnv } from '@/lib/env';

/** Single SMTP transport: Resend in production, Mailpit locally and in CI (research.md §R5). */
let transporter: Transporter | undefined;

export function getTransport(): Transporter {
  if (!transporter) {
    const env = serverEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      logger: false,
      debug: false,
    });
  }
  return transporter;
}
