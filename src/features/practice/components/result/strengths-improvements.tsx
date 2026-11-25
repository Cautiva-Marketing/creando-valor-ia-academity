import { ThumbsUp, TrendingUp } from 'lucide-react';

/** Strengths and improvements of the evaluation (T164; FR-046). */
export function StrengthsImprovements({
  strengths,
  improvements,
}: {
  strengths: readonly string[];
  improvements: readonly string[];
}) {
  const block = (id: string, title: string, Icon: typeof ThumbsUp, items: readonly string[]) => (
    <section
      aria-labelledby={id}
      data-testid={id}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4"
    >
      <h2 id={id} className="flex items-center gap-2 text-xl">
        <Icon className="size-5 text-accent-strong" aria-hidden="true" />
        {title}
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block('strengths', 'Fortalezas', ThumbsUp, strengths)}
      {block('improvements', 'Para mejorar', TrendingUp, improvements)}
    </div>
  );
}
