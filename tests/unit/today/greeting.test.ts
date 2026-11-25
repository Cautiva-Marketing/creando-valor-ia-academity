import { describe, expect, it } from 'vitest';
import { greetingFor } from '@/features/today/greeting';

/** T181 — greeting by the local hour of the profile/organization time zone (FR-051). */
describe('greetingFor', () => {
  it('uses the local hour of the time zone, not UTC', () => {
    // 13:30 UTC = 08:30 in Lima, 14:30 in Madrid.
    const at = new Date('2026-11-24T13:30:00Z');
    expect(greetingFor(at, 'America/Lima', 'Ana')).toBe('Buenos días, Ana');
    expect(greetingFor(at, 'Europe/Madrid', 'Ana')).toBe('Buenas tardes, Ana');
  });

  it('boundaries: 05:00 morning, 12:00 afternoon, 19:00 night, 04:59 night', () => {
    const lima = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00-05:00`);
    expect(greetingFor(lima('05:00'), 'America/Lima', 'Ana')).toBe('Buenos días, Ana');
    expect(greetingFor(lima('12:00'), 'America/Lima', 'Ana')).toBe('Buenas tardes, Ana');
    expect(greetingFor(lima('19:00'), 'America/Lima', 'Ana')).toBe('Buenas noches, Ana');
    expect(greetingFor(lima('04:59'), 'America/Lima', 'Ana')).toBe('Buenas noches, Ana');
  });

  it('without a name', () => {
    expect(greetingFor(new Date('2026-11-24T15:00:00Z'), 'America/Lima', null)).toBe('Buenos días');
  });
});
