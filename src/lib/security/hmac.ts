import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/** HMAC-SHA256 with the server pepper. Used for rate-limit keys (no PII stored, research.md §R9). */
export function hmacKey(value: string, pepper = serverEnv().RATE_LIMIT_PEPPER): Buffer {
  return createHmac('sha256', pepper).update(value, 'utf8').digest();
}

/** Postgres bytea literal accepted by PostgREST (`\x…`). */
export function toByteaHex(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}

/** Signs a timestamp (ms) for the access-request minimum fill time (research.md §R12). */
export function signTimestamp(ms: number, pepper = serverEnv().RATE_LIMIT_PEPPER): string {
  const sig = createHmac('sha256', pepper).update(`ts:${ms}`).digest('base64url');
  return `${ms}.${sig}`;
}

/** Returns the timestamp if the signature is valid, otherwise null. */
export function verifySignedTimestamp(
  signed: string,
  pepper = serverEnv().RATE_LIMIT_PEPPER,
): number | null {
  const match = /^(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(signed);
  if (!match) return null;
  const ms = Number(match[1]);
  const expected = createHmac('sha256', pepper).update(`ts:${ms}`).digest();
  const given = Buffer.from(match[2]!, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return ms;
}

/** Signed "form shown now" timestamp for the access-request form. */
export function signedFormStart(): string {
  return signTimestamp(Date.now());
}
