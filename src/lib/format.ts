/** es-PE formatting with Intl (research.md §R14, §R18). Dates always in an explicit time zone. */
export const DEFAULT_TIMEZONE = 'America/Lima';
const LOCALE = 'es-PE';

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "23 nov. 2026" */
export function formatDate(value: Date | string | number, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone }).format(toDate(value));
}

/** "23 nov. 2026, 14:05" */
export function formatDateTime(value: Date | string | number, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(toDate(value));
}

/** "lunes, 30 de noviembre de 2026" */
export function formatLongDate(value: Date | string | number, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'full', timeZone }).format(toDate(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** AI cost in the provider's currency: "US$ 0,0012" (plan → Complexity Tracking). */
export function formatUsd(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  const formatted = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
  return `US$ ${formatted}`;
}

/** Local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDateIso(value: Date, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
