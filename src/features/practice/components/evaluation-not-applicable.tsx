/** Session closed without seller messages (T154; FR-028d): nothing to evaluate. */
export function EvaluationNotApplicable() {
  return (
    <section
      data-testid="evaluation-not-applicable"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4"
    >
      <h2 className="text-xl">Sin evaluación</h2>
      <p className="text-text-muted">
        No fue evaluada porque no enviaste mensajes antes de que terminara el tiempo.
      </p>
    </section>
  );
}
