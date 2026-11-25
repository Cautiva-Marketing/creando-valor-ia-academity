import { ChevronRight, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { LEVEL_LABELS } from '../../practice/domain/labels';
import type { HistoryRow } from '../queries';
import { RetryEvaluationButton } from './retry-evaluation-button';

function statusLabel(row: HistoryRow): string {
  if (row.status === 'active') return 'En curso';
  if (row.status === 'evaluated') return 'Evaluada';
  switch (row.evaluationStatus) {
    case 'failed':
      return 'Evaluación fallida';
    case 'unavailable':
      return 'Evaluación no disponible';
    case 'not_applicable':
      return 'Sin evaluar';
    default:
      return 'Evaluando';
  }
}

/**
 * Started sessions, newest first (T179; FR-049): product vN, difficulty, date and time of the
 * organization, score, level and status. Actions: "Retomar" (active) and "Reintentar evaluación"
 * (failed: it still has manual retries; exhausted ones are `unavailable`).
 */
export function HistoryList({ rows, timezone }: { rows: readonly HistoryRow[]; timezone: string }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Prácticas" data-testid="history-list">
      {rows.map((row) => {
        const score =
          row.status === 'evaluated'
            ? row.totalScore === null
              ? 'Sin puntaje'
              : `${row.totalScore} de 100`
            : '—';
        return (
          <li
            key={row.sessionId}
            data-testid="history-row"
            data-status={row.status}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold break-words">
                {row.productName} <span className="text-text-muted">(v{row.productVersion})</span>
              </p>
              <p className="text-sm text-text-muted">
                Dificultad {row.difficulty} · {formatDateTime(row.startedAt, timezone)}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums" data-testid="history-score">
                  {score}
                </span>
                {row.level ? <Badge variant="neutral">{LEVEL_LABELS[row.level]}</Badge> : null}
                <Badge variant={row.status === 'active' ? 'accent' : 'neutral'}>
                  {statusLabel(row)}
                </Badge>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.status === 'active' ? (
                <Link
                  href={`/practicas/${row.sessionId}`}
                  className={buttonVariants({ variant: 'primary' })}
                >
                  <PlayCircle aria-hidden="true" />
                  Retomar
                </Link>
              ) : (
                <>
                  {row.evaluationStatus === 'failed' ? (
                    <RetryEvaluationButton sessionId={row.sessionId} />
                  ) : null}
                  <Link
                    href={`/practicas/${row.sessionId}`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {row.status === 'evaluated' ? 'Ver resultado' : 'Ver práctica'}
                    <span className="sr-only">
                      {' '}
                      de {row.productName}, {formatDateTime(row.startedAt, timezone)}
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
