import { describe, expect, it } from 'vitest';
import { resolvePeriod } from '@/features/usage/periods';

// 2026-03-01 03:00 UTC = 28 Feb 22:00 in Lima, 1 Mar 12:00 in Tokyo.
const now = new Date('2026-03-01T03:00:00Z');

describe('resolvePeriod', () => {
  it('today uses the local date of the time zone', () => {
    expect(resolvePeriod('today', { now, timeZone: 'America/Lima' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    expect(resolvePeriod('today', { now, timeZone: 'Asia/Tokyo' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });
  it('current month runs from day 1 to today', () => {
    expect(resolvePeriod('current_month', { now, timeZone: 'America/Lima' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
  it('previous month covers the whole month (including year change and leap years)', () => {
    expect(resolvePeriod('previous_month', { now, timeZone: 'America/Lima' })).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(
      resolvePeriod('previous_month', {
        now: new Date('2026-01-15T12:00:00Z'),
        timeZone: 'America/Lima',
      }),
    ).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(
      resolvePeriod('previous_month', {
        now: new Date('2028-03-10T12:00:00Z'),
        timeZone: 'America/Lima',
      }),
    ).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
  it('range returns the given dates', () => {
    expect(
      resolvePeriod('range', {
        now,
        timeZone: 'America/Lima',
        range: { from: '2026-01-05', to: '2026-01-10' },
      }),
    ).toEqual({
      from: '2026-01-05',
      to: '2026-01-10',
    });
  });
});
