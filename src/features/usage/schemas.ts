import { z } from 'zod';
import { USAGE_PERIODS } from './periods';

/** Real calendar date YYYY-MM-DD (rejects 2026-02-30). */
export const isoDate = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  },
  { error: 'Usa una fecha válida (AAAA-MM-DD).' },
);

/**
 * `/admin/consumo` query string: `periodo` (today | current_month | previous_month | range) and, for a
 * range, `desde`/`hasta` with `desde ≤ hasta` (≤ 366 days, like admin_usage_summary).
 */
export const usageSearchSchema = z
  .object({
    periodo: z.enum(USAGE_PERIODS).default('current_month'),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.periodo !== 'range') return;
    if (!value.desde || !value.hasta) {
      ctx.addIssue({
        code: 'custom',
        path: ['desde'],
        message: 'Indica las dos fechas del rango.',
      });
      return;
    }
    if (value.desde > value.hasta) {
      ctx.addIssue({
        code: 'custom',
        path: ['desde'],
        message: 'La fecha inicial debe ser anterior o igual a la final.',
      });
      return;
    }
    const days = (Date.parse(value.hasta) - Date.parse(value.desde)) / 86_400_000;
    if (days > 366) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: 'El rango puede abarcar hasta un año.',
      });
    }
  });

export type UsageSearch = z.infer<typeof usageSearchSchema>;
