import { Target } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * C.A.U.T.I.V.A.™ strip (T177; research.md §R13; FR-050, FR-051): 7 cells with the average per stage
 * or "sin datos"; the weakest stage gets a border, an icon and the text "Etapa a reforzar" (never
 * color alone). A tie goes to the first stage in canonical order.
 */
export interface StripStage {
  stage: string;
  label: string;
  /** 0–100 average, or null without data. */
  average: number | null;
}

export function weakestStage(stages: readonly StripStage[]): string | null {
  let weakest: StripStage | null = null;
  for (const s of stages) {
    if (s.average === null) continue;
    if (!weakest || s.average < weakest.average!) weakest = s;
  }
  return weakest?.stage ?? null;
}

const format = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

export function CautivaStrip({
  stages,
  title = 'Tu promedio por etapa C.A.U.T.I.V.A.™',
  description,
}: {
  stages: readonly StripStage[];
  title?: string;
  description?: string;
}) {
  const weakest = weakestStage(stages);
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid="cautiva-strip"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-xl">
          {title}
        </h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map((s) => {
          const isWeakest = s.stage === weakest;
          return (
            <li
              key={s.stage}
              data-testid="cautiva-stage"
              data-stage={s.stage}
              data-weakest={isWeakest || undefined}
              className={cn(
                'flex flex-col gap-1 rounded-md border p-3',
                isWeakest ? 'border-2 border-accent-strong bg-surface-sunken' : 'border-border',
              )}
            >
              <span className="font-semibold">{s.label}</span>
              <span className={cn('text-lg', s.average === null && 'text-sm text-text-muted')}>
                {s.average === null ? 'sin datos' : `${format.format(s.average)} %`}
              </span>
              {isWeakest ? (
                <span className="flex items-center gap-1 text-sm font-semibold text-accent-strong">
                  <Target className="size-4 shrink-0" aria-hidden="true" />
                  Etapa a reforzar
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
