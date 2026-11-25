import type { CriterionView } from '../../result/view-model';
import { CriterionCard } from './criterion-card';

/** Breakdown by criterion in rubric order (T163; FR-046). */
export function CriteriaList({ criteria }: { criteria: readonly CriterionView[] }) {
  return (
    <section aria-labelledby="criteria-title" className="flex flex-col gap-3">
      <h2 id="criteria-title" className="text-xl">
        Desglose por criterio
      </h2>
      <ol className="flex flex-col gap-3" data-testid="criteria-list">
        {criteria.map((c) => (
          <CriterionCard key={c.key} criterion={c} />
        ))}
      </ol>
    </section>
  );
}
