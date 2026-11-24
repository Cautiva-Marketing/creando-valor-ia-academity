import 'server-only';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { hmacKey, toByteaHex } from './hmac';
import { RATE_LIMITS, clientIpFrom, toInterval, type RateLimitScope } from './rate-limit-config';

export { RATE_LIMITS, clientIpFrom, type RateLimitScope } from './rate-limit-config';
export { retryMessage } from '@/lib/action-result';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Keys are HMAC(scope:value) so no PII is stored and scopes never collide. */
function keyFor(scope: RateLimitScope, value: string): string {
  return toByteaHex(hmacKey(`${scope}:${value}`));
}

/** Checks the limit WITHOUT recording an event. */
export async function checkRateLimit(
  scope: RateLimitScope,
  value: string,
): Promise<RateLimitDecision> {
  const rule = RATE_LIMITS[scope];
  const { data, error } = await createAdminClient()
    .rpc('check_rate_limit', {
      p_scope: scope,
      p_key: keyFor(scope, value),
      p_max: rule.max,
      p_window: toInterval(rule.windowSeconds),
      p_lockout: rule.lockoutSeconds === null ? undefined : toInterval(rule.lockoutSeconds),
    })
    .single();
  if (error || !data) throw new Error(`rate limit check failed (${error?.code ?? 'no data'})`);
  return { allowed: data.allowed, retryAfterSeconds: data.retry_after_seconds };
}

/** Records one event for the scope/key. */
export async function recordRateLimitEvent(scope: RateLimitScope, value: string): Promise<void> {
  const { error } = await createAdminClient().rpc('record_rate_limit_event', {
    p_scope: scope,
    p_key: keyFor(scope, value),
  });
  if (error) throw new Error(`rate limit record failed (${error.code})`);
}

/** Check and, if allowed, record (for scopes where every attempt counts, e.g. user_mutation). */
export async function consumeRateLimit(
  scope: RateLimitScope,
  value: string,
): Promise<RateLimitDecision> {
  const decision = await checkRateLimit(scope, value);
  if (decision.allowed) await recordRateLimitEvent(scope, value);
  return decision;
}

/** Client IP of the current request. */
export async function getClientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}
