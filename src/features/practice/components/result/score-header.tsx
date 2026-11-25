import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from '@/components/ui/score-ring';
import { formatLongDate } from '@/lib/format';
import type { Database } from '@/lib/supabase/database.types';
import { difficultyFor, type DifficultyLevel } from '../../domain/difficulty';
import { END_REASON_LABELS, LEVEL_LABELS } from '../../domain/labels';
import { NO_SCORE_TEXT } from '../../result/view-model';

type Level = Database['public']['Enums']['score_level'];

const LEVEL_VARIANT = {
  advanced: 'success',
  competent: 'primary',
  developing: 'warning',
  reinforcement: 'neutral',
} as const satisfies Record<Level, string>;

/**
 * Result header (T162; FR-046): ring with the total, level with a label (never color alone), end
 * reason, date, product with the version used, difficulty, hints and the "orientativa" notice.
 */
export function ScoreHeader({
  total,
  level,
  endReason,
  date,
  timezone,
  productName,
  productVersion,
  difficulty,
  hintsEnabled,
  hintsUsed,
}: {
  total: number | null;
  level: Level | null;
  endReason: Database['public']['Enums']['practice_end_reason'] | null;
  date: string;
  timezone: string;
  productName: string;
  productVersion: number;
  difficulty: number;
  hintsEnabled: boolean;
  hintsUsed: number;
}) {
  const d = difficultyFor(difficulty as DifficultyLevel);
  const meta: Array<[string, string]> = [
    ['Motivo de fin', endReason ? END_REASON_LABELS[endReason] : '—'],
    ['Fecha', formatLongDate(date, timezone)],
    ['Producto', `${productName} · versión ${productVersion}`],
    ['Dificultad', `${d.level} · ${d.name}`],
    [
      'Pistas',
      !hintsEnabled
        ? 'Desactivadas'
        : hintsUsed === 0
          ? 'No usaste pistas'
          : hintsUsed === 1
            ? 'Usaste 1 pista'
            : `Usaste ${hintsUsed} pistas`,
    ],
  ];
  return (
    <section
      aria-labelledby="result-score-title"
      className="flex flex-col gap-5 rounded-lg border border-border bg-surface-raised p-5 sm:p-6"
      data-testid="score-header"
    >
      <h2 id="result-score-title" className="sr-only">
        Puntaje
      </h2>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        {total === null ? (
          <p className="text-xl font-semibold" data-testid="evaluation-total">
            {NO_SCORE_TEXT}
          </p>
        ) : (
          <>
            <ScoreRing value={total} label={`Puntaje total: ${total} de 100`} size="lg" />
            <div className="flex flex-col gap-2">
              <p className="text-2xl font-semibold" data-testid="evaluation-total">
                {total} de 100
              </p>
              {level ? (
                <Badge variant={LEVEL_VARIANT[level]} data-testid="evaluation-level">
                  {LEVEL_LABELS[level]}
                </Badge>
              ) : null}
            </div>
          </>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-testid="result-meta">
        {meta.map(([term, value]) => (
          <div key={term} className="flex flex-col">
            <dt className="text-sm text-text-muted">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="flex items-start gap-2 text-sm text-text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Evaluación automática y orientativa: úsala para practicar, no como calificación definitiva.
      </p>
    </section>
  );
}
