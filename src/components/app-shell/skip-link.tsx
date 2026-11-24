/** First focusable element of every authenticated page (WCAG 2.4.1). */
export function SkipLink({ target = 'contenido' }: { target?: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:p-3 focus:text-text focus:shadow-lg"
    >
      Saltar al contenido
    </a>
  );
}
