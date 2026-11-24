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

/** Maps a Postgres/PostgREST error to an ActionFailure (unexpected ones go to Sentry). */
export function fromPostgresError(error: PostgrestLikeError, context?: string): ActionFailure {
  const code = mapPostgresCode(error.code);
  if (code === 'unexpected') return unexpected(error, context);
  return fail(code);
}
