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

/**
 * Soles in the spec's es-PE style (spec.md → "Precio en S/", routes.md): `S/ 1 250,00` — space as
 * thousands separator and comma for decimals. Written by hand because ICU's es-PE uses `1,250.00`.
 */
export function formatPEN(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  const [integer, decimals] = Math.abs(amount).toFixed(2).split('.') as [string, string];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `S/ ${amount < 0 ? '-' : ''}${grouped},${decimals}`;
}

/** "S/ X – S/ Y" (a range with equal bounds is shown as a single price). */
export function formatPENRange(min: number | string, max: number | string): string {
  return Number(min) === Number(max) ? formatPEN(min) : `${formatPEN(min)} – ${formatPEN(max)}`;
}

function splitAtLast(value: string, separator: string): [string, string] {
  const index = value.lastIndexOf(separator);
  return [value.slice(0, index), value.slice(index + 1)];
}

/**
 * Parses a price typed by the seller: accepts `1 250,50`, `1250.50`, `1.250,50`, `1,250.50` and an
 * optional `S/` prefix. At most 2 decimals and never negative. Returns null when invalid.
 */
export function parsePENInput(raw: string): number | null {
  const value = raw.replace(/^\s*S\/\s*/i, '').replace(/[\s  ]/g, '');
  if (!/^[\d.,]+$/.test(value)) return null;
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  let decimalSep: ',' | '.' | null = null;
  let thousandsSep: ',' | '.' | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.';
    thousandsSep = decimalSep === ',' ? '.' : ',';
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const occurrences = value.split(sep).length - 1;
    const digitsAfter = value.length - value.lastIndexOf(sep) - 1;
    if (occurrences === 1 && digitsAfter <= 2) decimalSep = sep;
    else thousandsSep = sep;
  }
  const [integerPart, decimalPart] = decimalSep ? splitAtLast(value, decimalSep) : [value, ''];
  if (thousandsSep) {
    const groups = thousandsSep === ',' ? /^\d{1,3}(,\d{3})*$/ : /^\d{1,3}(\.\d{3})*$/;
    if (!groups.test(integerPart)) return null;
  }
  const digits = thousandsSep ? integerPart.split(thousandsSep).join('') : integerPart;
  if (!/^\d+$/.test(digits) || !/^\d{0,2}$/.test(decimalPart)) return null;
  return Number(`${digits}.${decimalPart || '0'}`);
}
