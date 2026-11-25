import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPEN,
  formatPENRange,
  formatUsd,
  localDateIso,
  parsePENInput,
} from '@/lib/format';

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

describe('soles (spec.md → "Precio en S/", routes.md /productos)', () => {
  it.each([
    [1250, 'S/ 1 250,00'],
    [0, 'S/ 0,00'],
    [999.5, 'S/ 999,50'],
    [45000, 'S/ 45 000,00'],
    [1234567.891, 'S/ 1 234 567,89'],
  ])('formatPEN(%s) → %s', (value, expected) => {
    expect(formatPEN(value)).toBe(expected);
  });

  it('accepts numeric strings from Postgres numeric columns', () => {
    expect(formatPEN('48000.00')).toBe('S/ 48 000,00');
  });

  it('formats ranges and collapses equal bounds', () => {
    expect(formatPENRange(45000, 60000)).toBe('S/ 45 000,00 – S/ 60 000,00');
    expect(formatPENRange(350, 350)).toBe('S/ 350,00');
  });

  it.each([
    ['1 250,50', 1250.5],
    ['1250.50', 1250.5],
    ['1250', 1250],
    ['S/ 1 250,5', 1250.5],
    ['1.250,50', 1250.5],
    ['1,250.50', 1250.5],
    ['12,5', 12.5],
    ['1,250', 1250],
    ['0', 0],
  ])('parsePENInput(%j) → %s', (raw, expected) => {
    expect(parsePENInput(raw)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.2.3,4', '1 25a', '12,3456', '1,25,0', '1,234.567'])(
    'parsePENInput(%j) is invalid',
    (raw) => {
      expect(parsePENInput(raw)).toBeNull();
    },
  );
});
