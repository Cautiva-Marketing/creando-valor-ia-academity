import { z } from 'zod';

/**
 * `/historial` query filters (T174; contracts/routes.md; FR-049): `producto` (uuid), `dificultad`
 * (1–5), `desde`/`hasta` (YYYY-MM-DD), `pagina` (≥ 1). Invalid values are ignored, never an error; a
 * reversed range is swapped.
 */
export interface HistoryFilters {
  product: string | null;
  difficulty: number | null;
  from: string | null;
  to: string | null;
  page: number;
}

export const HISTORY_PAGE_SIZE = 20;

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const isoDate = z.iso.date();
const difficulty = z.coerce.number().int().min(1).max(5);
const page = z.coerce.number().int().min(1).max(10_000);

export function parseHistoryFilters(params: RawParams): HistoryFilters {
  const pick = <T>(schema: z.ZodType<T>, key: string): T | null => {
    const raw = first(params[key]);
    if (raw === undefined || raw === '') return null;
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  };
  let from = pick(isoDate, 'desde');
  let to = pick(isoDate, 'hasta');
  if (from && to && from > to) [from, to] = [to, from];
  return {
    product: pick(z.uuid(), 'producto'),
    difficulty: pick(difficulty, 'dificultad'),
    from,
    to,
    page: pick(page, 'pagina') ?? 1,
  };
}

/** Query string of the filters (page 1 omitted), with optional overrides. */
export function historyQueryString(
  filters: HistoryFilters,
  overrides: Partial<HistoryFilters> = {},
): string {
  const f = { ...filters, ...overrides };
  const query = new URLSearchParams();
  if (f.product) query.set('producto', f.product);
  if (f.difficulty) query.set('dificultad', String(f.difficulty));
  if (f.from) query.set('desde', f.from);
  if (f.to) query.set('hasta', f.to);
  if (f.page > 1) query.set('pagina', String(f.page));
  return query.toString();
}
