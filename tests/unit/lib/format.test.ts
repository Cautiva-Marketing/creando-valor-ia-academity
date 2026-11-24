import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatUsd, localDateIso } from '@/lib/format';

describe('format (es-PE)', () => {
  const instant = new Date('2026-11-30T03:30:00Z');

  it('formats dates in the requested time zone', () => {
    expect(localDateIso(instant, 'America/Lima')).toBe('2026-11-29');
    expect(localDateIso(instant, 'UTC')).toBe('2026-11-30');
    expect(formatDate(instant, 'America/Lima')).toMatch(/29/);
    expect(formatDate(instant, 'Asia/Tokyo')).toMatch(/30/);
  });

  it('formats date and time with es-PE conventions', () => {
    expect(formatDateTime(instant, 'America/Lima')).toMatch(/22:30|10:30/);
  });

  it('formats numbers with es-PE separators', () => {
    expect(formatNumber(1234567)).toMatch(/1.?234.?567/);
  });

  it('formats AI cost in US$', () => {
    expect(formatUsd(0.0012)).toBe('US$ 0.0012');
    expect(formatUsd('12.5')).toBe('US$ 12.50');
  });
});
