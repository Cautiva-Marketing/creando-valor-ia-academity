import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { CriterionView } from '../../result/view-model';
import { QuoteLink } from './quote-link';

/**
 * One rubric criterion (T163; FR-046): stages, bar score/max, justification, improvement, confidence
 * and quotes. `id="criterio-{key}"` is the target of "Volver al criterio".
 */
export function CriterionCard({ criterion }: { criterion: CriterionView }) {
  const anchor = `criterio-${criterion.key}`;
  const titleId = `${anchor}-title`;
  return (
    <li>
      <article
        id={anchor}
        tabIndex={-1}
        aria-labelledby={titleId}
        data-testid="criterion-card"
        data-criterion={criterion.key}
        className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3 id={titleId} className="text-lg">
              {criterion.name}
            </h3>
            <p className="flex flex-wrap gap-1" aria-label="Etapas C.A.U.T.I.V.A.">
              {criterion.stages.map((s) => (
                <Badge key={s.stage} variant="neutral">
                  {s.label}
                </Badge>
              ))}
            </p>
          </div>
          <p className="font-semibold" data-testid="criterion-score">
            {criterion.evaluated ? `${criterion.score} / ${criterion.maxScore}` : 'No evaluable'}
          </p>
        </div>
        {criterion.evaluated ? (
          <Progress
            value={criterion.score ?? 0}
            max={criterion.maxScore}
            aria-label={`${criterion.name}: ${criterion.score} de ${criterion.maxScore}`}
          />
        ) : null}
        <p>{criterion.justification}</p>
        {criterion.evaluated && criterion.improvement ? (
          <p>
            <span className="font-semibold">Para mejorar: </span>
            {criterion.improvement}
          </p>
        ) : null}
        {!criterion.evaluated ? (
          <p className="text-sm text-text-muted">
            No suma ni resta: el total se calcula solo con los criterios evaluados.
          </p>
        ) : null}
        <p className="text-sm text-text-muted" data-testid="criterion-confidence">
          Confianza: {criterion.confidence}
        </p>
        {criterion.quotes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Evidencia</p>
            <ul className="flex flex-col gap-2">
              {criterion.quotes.map((q) => (
                <li key={q.seq}>
                  <QuoteLink quote={q} backTo={anchor} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </li>
  );
}
