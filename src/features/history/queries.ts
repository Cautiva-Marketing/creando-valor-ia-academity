import 'server-only';
import type { StripStage } from '@/components/ui/cautiva-strip';
import type { TrendPoint } from '@/components/ui/score-trend-chart';
import { requireSeller } from '@/lib/auth/seller';
import { formatDate } from '@/lib/format';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { cautivaLabel } from '../practice/domain/cautiva';
import { HISTORY_PAGE_SIZE, type HistoryFilters } from './schemas';

type Enums = Database['public']['Enums'];

export interface HistoryRow {
  sessionId: string;
  productName: string;
  productVersion: number;
  difficulty: number;
  startedAt: string;
  status: Enums['practice_status'];
  evaluationStatus: Enums['evaluation_status'] | null;
  totalScore: number | null;
  level: Enums['score_level'] | null;
}

export interface HistoryView {
  timezone: string;
  rows: HistoryRow[];
  total: number;
  pageCount: number;
  /** Evaluated sessions of the filtered set, oldest first (up to the latest 100). */
  trend: TrendPoint[];
  stages: StripStage[];
  products: Array<{ id: string; name: string }>;
}

/** Shared by Hoy and Historial: the canonical 7 stages with their average (FR-050, FR-051). */
export async function stageAverages(
  args: Database['public']['Functions']['my_practice_stage_averages']['Args'],
): Promise<StripStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_practice_stage_averages', args);
  if (error) throw new Error(`stage averages failed (${error.code})`);
  return (data ?? []).map((s) => ({
    stage: s.stage,
    label: cautivaLabel(s.stage),
    average: s.avg_pct === null ? null : Number(s.avg_pct),
  }));
}

/**
 * Paginated list, evolution series and stage averages with the same filters (T175; FR-049, FR-050).
 * Started sessions only; dates in the organization time zone.
 */
export async function getHistory(filters: HistoryFilters): Promise<HistoryView> {
  const { ctx } = await requireSeller('/historial');
  const supabase = await createClient();
  const args = {
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_product: filters.product ?? undefined,
    p_difficulty: filters.difficulty ?? undefined,
  };
  const [page, series, stages, products] = await Promise.all([
    supabase.rpc('my_practice_history', {
      ...args,
      p_limit: HISTORY_PAGE_SIZE,
      p_offset: (filters.page - 1) * HISTORY_PAGE_SIZE,
    }),
    supabase.rpc('my_practice_history', { ...args, p_limit: 100, p_offset: 0 }),
    stageAverages(args),
    supabase.from('products').select('id, current_name').order('current_name'),
  ]);
  if (page.error) throw new Error(`history failed (${page.error.code})`);
  if (series.error) throw new Error(`history series failed (${series.error.code})`);
  if (products.error) throw new Error(`history products failed (${products.error.code})`);

  // An out-of-range page still knows the total from the first page of the series.
  const total = Number(page.data?.[0]?.total_count ?? series.data?.[0]?.total_count ?? 0);
  return {
    timezone: ctx.timezone,
    rows: (page.data ?? []).map((r) => ({
      sessionId: r.session_id,
      productName: r.product_name,
      productVersion: r.product_version,
      difficulty: r.difficulty,
      startedAt: r.started_at,
      status: r.status,
      evaluationStatus: r.evaluation_status,
      totalScore: r.total_score,
      level: r.level,
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
    trend: (series.data ?? [])
      .filter((r) => r.status === 'evaluated' && r.total_score !== null)
      .reverse()
      .map((r) => ({
        label: formatDate(r.started_at, ctx.timezone),
        score: r.total_score!,
        detail: `${r.product_name} (v${r.product_version})`,
      })),
    stages,
    products: (products.data ?? []).map((p) => ({ id: p.id, name: p.current_name })),
  };
}
