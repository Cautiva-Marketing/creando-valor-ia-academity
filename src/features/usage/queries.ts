import 'server-only';
import { requireSuperadmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { DateRange } from './periods';

export interface UsageRow {
  organizationId: string;
  organizationName: string;
  simulations: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface UsageSummary {
  rows: UsageRow[];
  totals: Omit<UsageRow, 'organizationId' | 'organizationName'>;
}

/** Aggregated usage per organization (S2, rpc admin_usage_summary; no conversation content). */
export async function getUsageSummary({ from, to }: DateRange): Promise<UsageSummary> {
  await requireSuperadmin('/admin/consumo');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_usage_summary', { p_from: from, p_to: to });
  if (error) throw new Error(`admin_usage_summary failed (${error.code})`);
  const rows: UsageRow[] = (data ?? []).map((r) => ({
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    simulations: Number(r.simulations),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    estimatedCostUsd: Number(r.estimated_cost_usd),
  }));
  const totals = rows.reduce(
    (acc, row) => ({
      simulations: acc.simulations + row.simulations,
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      estimatedCostUsd: acc.estimatedCostUsd + row.estimatedCostUsd,
    }),
    { simulations: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
  );
  return { rows, totals };
}
