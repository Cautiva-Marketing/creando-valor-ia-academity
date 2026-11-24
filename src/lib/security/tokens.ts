import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/** Invitation token: 32 random bytes in base64url = 43 characters (research.md §R4). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of the token; only the hash is stored (bytea). */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/** Hash as a Postgres bytea literal for RPC parameters. */
export function hashTokenHex(token: string): string {
  return `\\x${hashToken(token).toString('hex')}`;
}
