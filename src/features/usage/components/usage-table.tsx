'use client';

import { DataTable, type DataColumn } from '@/components/ui/table';
import { formatNumber, formatUsd } from '@/lib/format';
import type { UsageRow, UsageSummary } from '../queries';

const columns: DataColumn<UsageRow>[] = [
  {
    key: 'org',
    header: 'Organización',
    cell: (row) => <span className="font-medium break-words">{row.organizationName}</span>,
  },
  { key: 'simulations', header: 'Simulaciones', cell: (row) => formatNumber(row.simulations) },
  { key: 'input', header: 'Tokens de entrada', cell: (row) => formatNumber(row.inputTokens) },
  { key: 'output', header: 'Tokens de salida', cell: (row) => formatNumber(row.outputTokens) },
  { key: 'cost', header: 'Costo estimado', cell: (row) => formatUsd(row.estimatedCostUsd) },
];

/** Aggregated usage per organization (no links to conversations, FR-006) plus totals. */
export function UsageTable({ summary }: { summary: UsageSummary }) {
  const { totals } = summary;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totales del periodo">
        {[
          ['Simulaciones', formatNumber(totals.simulations)],
          ['Tokens de entrada', formatNumber(totals.inputTokens)],
          ['Tokens de salida', formatNumber(totals.outputTokens)],
          ['Costo estimado', formatUsd(totals.estimatedCostUsd)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4"
          >
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="font-display text-2xl font-bold" data-total={label}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <DataTable
        caption="Consumo por organización"
        columns={columns}
        rows={summary.rows}
        rowKey={(row) => row.organizationId}
        mobileTitle={(row) => <span className="break-words">{row.organizationName}</span>}
      />
    </div>
  );
}
