import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';

/**
 * Guided first steps (T185; US9 scenario 1; FR-052): register a product, add objections, first
 * practice. Each step says whether it is done with text and an icon, not color alone.
 */
export function GuidedSteps({
  steps,
}: {
  steps: { product: boolean; objections: boolean; practice: boolean };
}) {
  const items = [
    { done: steps.product, title: 'Registra un producto', href: '/productos/nuevo' },
    { done: steps.objections, title: 'Agrega sus objeciones', href: '/productos' },
    { done: steps.practice, title: 'Haz tu primera práctica', href: '/practicar' },
  ];
  const current = items.findIndex((i) => !i.done);
  return (
    <section
      aria-labelledby="guided-steps-title"
      data-testid="guided-steps"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4"
    >
      <h2 id="guided-steps-title" className="text-xl">
        Tus primeros pasos
      </h2>
      <ol className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={item.title}
            data-testid="guided-step"
            data-done={item.done}
            aria-current={index === current ? 'step' : undefined}
            className="flex items-center gap-3"
          >
            {item.done ? (
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="size-5 shrink-0 text-text-muted" aria-hidden="true" />
            )}
            <span className="font-semibold">{index + 1}.</span>
            {index === current ? (
              <Link
                href={item.href}
                className="font-semibold text-primary underline underline-offset-4"
              >
                {item.title}
              </Link>
            ) : (
              <span className={item.done ? 'text-text-muted' : undefined}>{item.title}</span>
            )}
            <span className="sr-only">{item.done ? '(hecho)' : '(pendiente)'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
