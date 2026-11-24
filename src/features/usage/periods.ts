import { localDateIso } from '@/lib/format';

/**
 * Usage periods (contracts/routes.md `/admin/consumo`): today, current month, previous month and a
 * custom range. Dates are calendar days (YYYY-MM-DD) in the viewer's time zone; the SQL function then
 * applies each organization's own time zone to its usage rows.
 */
export const USAGE_PERIODS = ['today', 'current_month', 'previous_month', 'range'] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export const USAGE_PERIOD_LABELS: Record<UsagePeriod, string> = {
  today: 'Hoy',
  current_month: 'Mes actual',
  previous_month: 'Mes anterior',
  range: 'Rango',
};

export interface DateRange {
  from: string;
  to: string;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Resolves a period to an inclusive [from, to] range of local dates. */
export function resolvePeriod(
  period: UsagePeriod,
  { now = new Date(), timeZone, range }: { now?: Date; timeZone: string; range?: DateRange },
): DateRange {
  const today = localDateIso(now, timeZone);
  const [year, month] = today.split('-').map(Number) as [number, number];
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'current_month':
      return { from: `${year}-${pad(month)}-01`, to: today };
    case 'previous_month': {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      return {
        from: `${prevYear}-${pad(prevMonth)}-01`,
        to: `${prevYear}-${pad(prevMonth)}-${pad(lastDayOfMonth(prevYear, prevMonth))}`,
      };
    }
    case 'range':
      if (!range) throw new Error('range period requires from/to');
      return range;
  }
}
