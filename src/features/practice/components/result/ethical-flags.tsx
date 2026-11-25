import { ShieldAlert } from 'lucide-react';
import type { ResultViewModel } from '../../result/view-model';
import { QuoteLink } from './quote-link';

/**
 * Ethical flags (T164; FR-040): type, explanation and quotes, shown apart from the score (they never
 * change it).
 */
export function EthicalFlags({ flags }: { flags: ResultViewModel['flags'] }) {
  if (flags.length === 0) return null;
  return (
    <section
      id="banderas-eticas"
      tabIndex={-1}
      aria-labelledby="ethical-flags-title"
      data-testid="ethical-flags"
      className="flex flex-col gap-3 rounded-lg border border-warning bg-surface-raised p-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <div className="flex flex-col gap-1">
        <h2 id="ethical-flags-title" className="flex items-center gap-2 text-xl">
          <ShieldAlert className="size-5" aria-hidden="true" />
          Alertas éticas
        </h2>
        <p className="text-sm text-text-muted">No cambian tu puntaje; revisa cómo evitarlas.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {flags.map((f) => (
          <li key={f.type} data-testid="ethical-flag" className="flex flex-col gap-2">
            <p className="font-semibold">{f.label}</p>
            <p>{f.explanation}</p>
            <ul className="flex flex-col gap-2">
              {f.quotes.map((q) => (
                <li key={q.seq}>
                  <QuoteLink quote={q} backTo="banderas-eticas" />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
