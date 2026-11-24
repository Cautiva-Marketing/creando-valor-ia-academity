import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, hashTokenHex } from '@/lib/security/tokens';

describe('invitation tokens (research.md §R4)', () => {
  it('generates 43-character base64url tokens', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it('hashes with SHA-256 deterministically', () => {
    const token = 'seed-pending-token-aaaaaaaaaaaaaaaaaaaaaaaa';
    expect(hashToken(token)).toHaveLength(32);
    expect(hashToken(token).equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(hashTokenHex(token)).toBe(`\\x${createHash('sha256').update(token).digest('hex')}`);
  });
});
