import { describe, expect, it } from 'vitest';
import { hmacKey, signTimestamp, toByteaHex, verifySignedTimestamp } from '@/lib/security/hmac';

const pepper = 'unit-test-pepper-unit-test-pepper';

describe('hmac', () => {
  it('produces stable 32-byte keys that depend on the pepper', () => {
    expect(hmacKey('a@b.test', pepper)).toHaveLength(32);
    expect(hmacKey('a@b.test', pepper).equals(hmacKey('a@b.test', pepper))).toBe(true);
    expect(hmacKey('a@b.test', pepper).equals(hmacKey('a@b.test', `${pepper}x`))).toBe(false);
  });

  it('encodes bytea literals', () => {
    expect(toByteaHex(Buffer.from([0, 255]))).toBe('\\x00ff');
  });

  it('signs and verifies timestamps', () => {
    const signed = signTimestamp(1_700_000_000_000, pepper);
    expect(verifySignedTimestamp(signed, pepper)).toBe(1_700_000_000_000);
  });

  it('rejects tampered or foreign signatures', () => {
    const signed = signTimestamp(1_700_000_000_000, pepper);
    const [, sig] = signed.split('.');
    expect(verifySignedTimestamp(`1600000000000.${sig}`, pepper)).toBeNull();
    expect(verifySignedTimestamp(signed, 'another-pepper-another-pepper')).toBeNull();
    expect(verifySignedTimestamp('garbage', pepper)).toBeNull();
  });
});
