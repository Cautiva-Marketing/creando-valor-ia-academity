import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  checkPasswordPolicy,
  isCommonPassword,
  isPwnedPassword,
} from '@/lib/security/password-policy';
import { evaluatePasswordRequirements } from '@/lib/security/password-rules';

const commonList = new Set(['password123', 'qwertyuiop']);

function hibpResponder(password: string, count: number) {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  return vi.fn(async (url: string) => {
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    return new Response(`0000000000000000000000000000000000A:0\r\n${sha1.slice(5)}:${count}\r\n`);
  });
}

const notPwned = vi.fn(async () => new Response('0000000000000000000000000000000000A:0'));

describe('password policy (FR-014, research.md §R6)', () => {
  it('requires at least 10 characters', async () => {
    const result = await checkPasswordPolicy('Corta1!', 'ana@ejemplo.test', {
      fetchImpl: notPwned,
      commonList,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('too_short');
  });

  it('rejects the email and its local part (normalized)', async () => {
    const email = 'Ana.Lopez2026@Ejemplo.test';
    const full = await checkPasswordPolicy(' ana.lopez2026@ejemplo.test ', email, {
      fetchImpl: notPwned,
      commonList,
    });
    const local = await checkPasswordPolicy('ANA.LOPEZ2026', email, {
      fetchImpl: notPwned,
      commonList,
    });
    expect(full.issues).toContain('same_as_email');
    expect(local.issues).toContain('same_as_email');
  });

  it('rejects passwords in the local common list', async () => {
    expect(isCommonPassword('Password123', commonList)).toBe(true);
    const result = await checkPasswordPolicy('password123', 'a@b.test', {
      fetchImpl: notPwned,
      commonList,
    });
    expect(result.issues).toEqual(['common']);
  });

  it('ships the real top-10,000 list (server only)', () => {
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('1q2w3e4r5t')).toBe(true);
  });

  it('rejects passwords breached according to HIBP (k-anonymity, padding)', async () => {
    const password = 'Ventas-Seguras-2026';
    const fetchImpl = hibpResponder(password, 42);
    const result = await checkPasswordPolicy(password, 'a@b.test', { fetchImpl, commonList });
    expect(result.issues).toEqual(['pwned']);
    const init = (fetchImpl.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get('Add-Padding')).toBe('true');
  });

  it('ignores padding entries with count 0', async () => {
    const password = 'Ventas-Seguras-2026';
    expect(await isPwnedPassword(password, hibpResponder(password, 0))).toBe(false);
  });

  it('fails open when HIBP times out or errors', async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    expect(await isPwnedPassword('Algo-Seguro-2026', slow, 20)).toBeNull();
    const result = await checkPasswordPolicy('Algo-Seguro-2026', 'a@b.test', {
      fetchImpl: vi.fn(async () => new Response('', { status: 503 })),
      commonList,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a strong, unique password', async () => {
    const result = await checkPasswordPolicy('Cierre-Consultivo-77', 'ana@ejemplo.test', {
      fetchImpl: notPwned,
      commonList,
    });
    expect(result).toEqual({ ok: true, issues: [], messages: [] });
  });

  it('client mirror evaluates the visible requirements', () => {
    const reqs = evaluatePasswordRequirements('ana', 'ana@ejemplo.test');
    expect(reqs.find((r) => r.id === 'length')?.met).toBe(false);
    expect(reqs.find((r) => r.id === 'not_email')?.met).toBe(false);
  });
});
