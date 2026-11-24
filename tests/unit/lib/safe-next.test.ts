import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/auth/safe-next';

describe('safeNext', () => {
  it.each(['/inicio', '/admin/invitaciones?estado=pending', '/perfil#zona'])(
    'accepts %s',
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/javascript:alert(1)',
    'inicio',
    '',
    null,
    undefined,
    '/\u0000x',
  ])('rejects %s', (value) => {
    expect(safeNext(value as string | null | undefined)).toBeNull();
  });
});
