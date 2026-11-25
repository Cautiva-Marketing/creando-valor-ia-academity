import * as Sentry from '@sentry/nextjs';

/** Closed error catalog (research.md §R17). Messages are Spanish copy; never the original error. */
export type ErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'invitation_invalid'
  | 'suspended'
  | 'quota_exhausted'
  | 'setup_limit'
  | 'active_session'
  | 'ai_unavailable'
  | 'unexpected';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      fieldErrors?: Record<string, string[]>;
      retryAfterSeconds?: number;
      values?: Record<string, string>;
      /** Extra, non-sensitive details for the UI (e.g. existing invitation, invalid reason). */
      details?: Record<string, string>;
      /** Correlation id shown to the user for `unexpected` errors. */
      referenceId?: string;
    };

export type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  validation: 'Revisa los campos marcados.',
  unauthorized: 'Correo o contraseña incorrectos.',
  forbidden: 'No tienes permiso para realizar esta acción.',
  not_found: 'No encontramos lo que buscas.',
  conflict: 'La operación no es posible en el estado actual.',
  rate_limited: 'Demasiados intentos.',
  invitation_invalid: 'Esta invitación no es válida.',
  suspended: 'Tu acceso está suspendido.',
  quota_exhausted: 'Alcanzaste tu límite de simulaciones.',
  setup_limit: 'Alcanzaste el máximo de configuraciones de hoy.',
  active_session: 'Tienes una práctica en curso.',
  ai_unavailable: 'No pudimos preparar a tu comprador. Inténtalo de nuevo.',
  unexpected: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
};

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<undefined>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  extra: Omit<ActionFailure, 'ok' | 'code' | 'message'> & { message?: string } = {},
): ActionFailure {
  const { message, ...rest } = extra;
  return { ok: false, code, message: message ?? ERROR_MESSAGES[code], ...rest };
}

/** "Vuelve a intentarlo en N minutos" (always at least 1 minute). */
export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Demasiados intentos. Vuelve a intentarlo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
}

export function rateLimited(retryAfterSeconds: number): ActionFailure {
  return fail('rate_limited', { retryAfterSeconds, message: retryMessage(retryAfterSeconds) });
}

/** Postgres ERRCODE → ErrorCode (contracts/database-rpc.md). Unknown codes are unexpected. */
export function mapPostgresCode(pgCode: string | null | undefined): ErrorCode {
  switch (pgCode) {
    case '42501':
      return 'forbidden';
    case 'P0002':
      return 'not_found';
    case 'P0010':
    case 'P0012':
    case '23505':
      return 'conflict';
    case 'P0011':
      return 'invitation_invalid';
    case 'P0020':
      return 'quota_exhausted';
    case 'P0021':
      return 'setup_limit';
    case 'P0022':
      return 'active_session';
    case '23514':
    case '22023':
      return 'validation';
    default:
      return 'unexpected';
  }
}

export interface PostgrestLikeError {
  code?: string | null;
  details?: string | null;
  message?: string | null;
}

/** Correlation id (short, non-guessable enough for support lookups). */
export function newReferenceId(): string {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

/**
 * Reports an unexpected error to Sentry with a correlation id and returns the `unexpected` result.
 * The original error never reaches the client.
 */
export function unexpected(error: unknown, context?: string): ActionFailure {
  const referenceId = newReferenceId();
  Sentry.captureException(error, { tags: { referenceId, ...(context ? { context } : {}) } });
  console.error(`[unexpected] ref=${referenceId}${context ? ` ctx=${context}` : ''}`);
  return fail('unexpected', {
    referenceId,
    message: `${ERROR_MESSAGES.unexpected} Referencia: ${referenceId}.`,
  });
}

/** P0010 reasons the UI may show (contracts/database-rpc.md); anything else is dropped. */
export const CONFLICT_REASONS = [
  'not_configured',
  'expired',
  'not_active',
  'turn_in_progress',
  'message_limit',
  'no_seller_messages',
  'not_failed',
  'retries_exhausted',
  'hint_already_used',
  'objection_limit',
  'version_mismatch',
  'product_archived',
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Parses the SQL `DETAIL` of the 002 error codes into UI details. Only known shapes pass; a malformed
 * DETAIL is dropped so internal text never reaches the client.
 */
export function parseErrorDetails(
  pgCode: string | null | undefined,
  detail: string | null | undefined,
): Record<string, string> | undefined {
  if (!detail) return undefined;
  switch (pgCode) {
    case 'P0020': {
      if (detail === 'disabled') return { scope: 'disabled' };
      const [scope, ...rest] = detail.split(':');
      const renewsAt = isoOrNull(rest.join(':'));
      if ((scope === 'daily' || scope === 'monthly') && renewsAt) return { scope, renewsAt };
      return undefined;
    }
    case 'P0021': {
      const [reason, ...rest] = detail.split(':');
      const retryAt = isoOrNull(rest.join(':'));
      if ((reason === 'success' || reason === 'failure') && retryAt) return { reason, retryAt };
      return undefined;
    }
    case 'P0022':
      return UUID_RE.test(detail) ? { sessionId: detail } : undefined;
    case 'P0010':
      return (CONFLICT_REASONS as readonly string[]).includes(detail)
        ? { reason: detail }
        : undefined;
    default:
      return undefined;
  }
}

/** Maps a Postgres/PostgREST error to an ActionFailure (unexpected ones go to Sentry). */
export function fromPostgresError(error: PostgrestLikeError, context?: string): ActionFailure {
  const code = mapPostgresCode(error.code);
  if (code === 'unexpected') return unexpected(error, context);
  const details = parseErrorDetails(error.code, error.details);
  return fail(code, details ? { details } : {});
}
