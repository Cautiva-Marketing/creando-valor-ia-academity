import { describe, expect, it } from 'vitest';
import { initials } from '@/lib/initials';

describe('initials', () => {
  it('takes the first grapheme of the first and last words', () => {
    expect(initials('Ana María Pérez')).toBe('AP');
  });
  it('keeps accents and ñ', () => {
    expect(initials('Ñandú')).toBe('Ñ');
    expect(initials('ángel ñuñez')).toBe('ÁÑ');
  });
  it('handles emoji as a single grapheme', () => {
    expect(initials('👩‍💻 Dev')).toBe('👩‍💻D');
  });
  it('handles a single character', () => {
    expect(initials('x')).toBe('X');
  });
  it('falls back to "?" when empty', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});
