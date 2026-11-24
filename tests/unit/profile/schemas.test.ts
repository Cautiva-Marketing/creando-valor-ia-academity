import { describe, expect, it } from 'vitest';
import { updateProfileSchema } from '@/features/profile/schemas';

const valid = { fullName: 'Ana Vendedora', timezone: 'America/Lima' };

describe('updateProfileSchema', () => {
  it('trims the name and accepts 1–80 characters', () => {
    expect(updateProfileSchema.parse({ ...valid, fullName: '  Ñandú  ' }).fullName).toBe('Ñandú');
    expect(updateProfileSchema.safeParse({ ...valid, fullName: 'x'.repeat(80) }).success).toBe(
      true,
    );
  });
  it('rejects an empty, blank or too long name', () => {
    for (const fullName of ['', '    ', 'x'.repeat(81)]) {
      expect(updateProfileSchema.safeParse({ ...valid, fullName }).success).toBe(false);
    }
  });
  it('checks only the time zone format (not membership in Intl)', () => {
    for (const timezone of [
      'America/Lima',
      'Etc/GMT+5',
      'America/Argentina/Buenos_Aires',
      'UTC',
      'Mars/Olympus',
    ]) {
      expect(updateProfileSchema.safeParse({ ...valid, timezone }).success).toBe(true);
    }
  });
  it('rejects malformed time zones', () => {
    for (const timezone of [
      '',
      'America/Lima; drop',
      'Zona horaria',
      'x'.repeat(65),
      'Ámérica/Lima',
    ]) {
      expect(updateProfileSchema.safeParse({ ...valid, timezone }).success).toBe(false);
    }
  });
});
