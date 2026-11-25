import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreRing } from '@/components/ui/score-ring';
import { formatDate } from '@/lib/format';
import { LEVEL_LABELS } from '../../practice/domain/labels';
import type { LastResult } from '../queries';

export function trendText(delta: number): string {
  if (delta === 0) return 'Te mantuviste igual que en la práctica anterior';
  const points = Math.abs(delta) === 1 ? '1 punto' : `${Math.abs(delta)} puntos`;
  return delta > 0
    ? `Subiste ${points} frente a la práctica anterior`
    : `Bajaste ${points} frente a la práctica anterior`;
}

/**
 * Last result with the trend against the previous one (T186; US9 scenario 3): score, level, date and
 * a text + icon trend (never color alone), with a link to the result.
 */
export function LastResultCard({ result, timezone }: { result: LastResult; timezone: string }) {
  const TrendIcon =
    result.delta === null || result.delta === 0
      ? ArrowRight
      : result.delta > 0
        ? ArrowUpRight
        : ArrowDownRight;
  return (
    <Card data-testid="last-result">
      <CardHeader>
        <CardTitle>Tu último resultado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {result.totalScore !== null ? (
          <ScoreRing
            value={result.totalScore}
            label={`Último puntaje: ${result.totalScore} de 100`}
          />
        ) : null}
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-xl font-semibold" data-testid="last-result-score">
            {result.totalScore === null ? 'Sin puntaje' : `${result.totalScore} de 100`}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            {result.level ? <Badge variant="neutral">{LEVEL_LABELS[result.level]}</Badge> : null}
            {result.productName} · {formatDate(result.date, timezone)}
          </p>
          {result.delta !== null ? (
            <p className="flex items-center gap-1 text-sm" data-testid="last-result-trend">
              <TrendIcon className="size-4 shrink-0" aria-hidden="true" />
              {trendText(result.delta)}
            </p>
          ) : null}
        </div>
        <Link
          href={`/practicas/${result.sessionId}`}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Ver resultado
          <ChevronRight aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
