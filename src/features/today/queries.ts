import 'server-only';
import type { StripStage } from '@/components/ui/cautiva-strip';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { stageAverages } from '../history/queries';
import {
  getCurrentPractice,
  getQuotaStatus,
  type CurrentPractice,
  type QuotaStatus,
} from '../practice/queries';
import { recommendNextAction, type NextAction } from './recommendation';

type Enums = Database['public']['Enums'];

export interface LastResult {
  sessionId: string;
  totalScore: number | null;
  level: Enums['score_level'] | null;
  date: string;
  productName: string;
  /** Difference with the previous evaluated session; null without a previous score. */
  delta: number | null;
}

export interface TodayView {
  current: CurrentPractice | null;
  next: NextAction;
  /** Guided steps (FR-052) while there are no evaluations: which ones are done. */
  steps: { product: boolean; objections: boolean; practice: boolean } | null;
  lastResult: LastResult | null;
  stages: StripStage[];
  quota: QuotaStatus;
}

/**
 * Everything "Hoy" needs (T184; FR-051, FR-052): active products and products with objections, the
 * two latest evaluated sessions, the last used products, the averages of the last 5 evaluated
 * sessions, the current practice and the quota. The caller already checked the seller guard.
 */
export async function getToday(userId: string): Promise<TodayView> {
  const supabase = await createClient();
  const [products, evaluated, recent, stages, current, quota] = await Promise.all([
    supabase.from('products').select('id, objections(count)').eq('status', 'active'),
    supabase
      .from('practice_sessions')
      .select(
        'id, ended_at, started_at, product_version_id, practice_evaluations(total_score, level)',
      )
      .eq('user_id', userId)
      .eq('status', 'evaluated')
      .order('started_at', { ascending: false })
      .limit(2),
    supabase
      .from('practice_sessions')
      .select('product_id')
      .eq('user_id', userId)
      .neq('status', 'discarded')
      .order('configured_at', { ascending: false })
      .limit(10),
    stageAverages({ p_last_n: 5 }),
    getCurrentPractice(),
    getQuotaStatus(),
  ]);
  if (products.error) throw new Error(`today products failed (${products.error.code})`);
  if (evaluated.error) throw new Error(`today evaluated failed (${evaluated.error.code})`);
  if (recent.error) throw new Error(`today recent failed (${recent.error.code})`);

  const activeProductIds = (products.data ?? []).map((p) => p.id);
  const productIdsWithObjections = (products.data ?? [])
    .filter((p) => (p.objections[0]?.count ?? 0) > 0)
    .map((p) => p.id);
  const evaluations = (evaluated.data ?? []).map((s) => {
    const e = Array.isArray(s.practice_evaluations)
      ? s.practice_evaluations[0]
      : s.practice_evaluations;
    return { ...s, totalScore: e?.total_score ?? null, level: e?.level ?? null };
  });

  let lastResult: LastResult | null = null;
  const [last, previous] = evaluations;
  if (last) {
    const { data: version } = await supabase
      .from('product_versions')
      .select('name')
      .eq('id', last.product_version_id)
      .maybeSingle();
    lastResult = {
      sessionId: last.id,
      totalScore: last.totalScore,
      level: last.level,
      date: last.ended_at ?? last.started_at ?? new Date().toISOString(),
      productName: version?.name ?? '',
      delta:
        previous && last.totalScore !== null && previous.totalScore !== null
          ? last.totalScore - previous.totalScore
          : null,
    };
  }

  const next = recommendNextAction({
    activeProductIds,
    productIdsWithObjections,
    hasEvaluations: evaluations.length > 0,
    recentProductIds: (recent.data ?? []).map((s) => s.product_id),
    stages,
  });
  return {
    current,
    next,
    steps:
      evaluations.length === 0
        ? {
            product: activeProductIds.length > 0,
            objections: productIdsWithObjections.length > 0,
            practice: false,
          }
        : null,
    lastResult,
    stages,
    quota,
  };
}
