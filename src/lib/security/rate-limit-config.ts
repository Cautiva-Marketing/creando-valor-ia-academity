/** Rate-limit scopes (research.md §R9). Shared by the server module and unit tests. */
export type RateLimitScope =
  | 'login_account'
  | 'login_ip'
  | 'mfa_verify'
  | 'recovery_email'
  | 'activation_ip'
  | 'access_request_ip'
  | 'webhook_id'
  | 'user_mutation';

export interface RateLimitRule {
  /** Maximum events inside the window before blocking. */
  max: number;
  /** Window in seconds. */
  windowSeconds: number;
  /** Lockout counted from the last event, in seconds (null = until leaving the window). */
  lockoutSeconds: number | null;
}

const MIN = 60;
const HOUR = 60 * MIN;

export const RATE_LIMITS: Record<RateLimitScope, RateLimitRule> = {
  login_account: { max: 5, windowSeconds: 15 * MIN, lockoutSeconds: 15 * MIN },
  login_ip: { max: 20, windowSeconds: 15 * MIN, lockoutSeconds: 15 * MIN },
  mfa_verify: { max: 5, windowSeconds: 15 * MIN, lockoutSeconds: 15 * MIN },
  recovery_email: { max: 3, windowSeconds: HOUR, lockoutSeconds: null },
  activation_ip: { max: 10, windowSeconds: HOUR, lockoutSeconds: null },
  access_request_ip: { max: 3, windowSeconds: HOUR, lockoutSeconds: null },
  webhook_id: { max: 1, windowSeconds: 24 * HOUR, lockoutSeconds: 24 * HOUR },
  user_mutation: { max: 60, windowSeconds: MIN, lockoutSeconds: MIN },
};

export function toInterval(seconds: number): string {
  return `${seconds} seconds`;
}

/** Client IP behind Vercel (`x-real-ip` / first `x-forwarded-for`), research.md §R9. */
export function clientIpFrom(headers: Pick<Headers, 'get'>): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}
