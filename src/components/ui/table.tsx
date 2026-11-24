import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Responsive data table (research.md §R15): real <table> from 640 px; below, each row becomes a
 * card rendered as a description list. No horizontal page scroll at 360 px.
 */
export interface DataColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  /** Hide the label in the mobile card (e.g. action column). */
  hideLabelOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  caption: string;
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Optional title of each mobile card (defaults to the first column). */
  mobileTitle?: (row: Row) => React.ReactNode;
  className?: string;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  mobileTitle,
  className,
}: DataTableProps<Row>) {
  const [first, ...rest] = columns;
  return (
    <div data-slot="data-table" className={className}>
      <table className="hidden w-full border-collapse text-left sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border-strong">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-3 py-3 text-sm font-semibold text-text-muted', column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border align-middle"
              data-row-key={rowKey(row)}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn('px-3 py-3', column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-3 sm:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            data-row-key={rowKey(row)}
            className="rounded-lg border border-border bg-surface-raised p-4"
          >
            <div className="mb-2 font-semibold break-words">
              {mobileTitle ? mobileTitle(row) : first ? first.cell(row) : null}
            </div>
            <dl className="grid grid-cols-1 gap-2">
              {(mobileTitle ? columns : rest).map((column) => (
                <div key={column.key} className="flex flex-col gap-0.5">
                  <dt
                    className={cn(
                      'text-xs font-semibold text-text-muted',
                      column.hideLabelOnMobile && 'sr-only',
                    )}
                  >
                    {column.header}
                  </dt>
                  <dd className="break-words">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
