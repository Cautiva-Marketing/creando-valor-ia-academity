'use client';

import type { Quote } from '../../result/view-model';

/** Event the transcript listens to: highlight message `seq` and offer a way back to `backTo`. */
export const QUOTE_EVENT = 'practice:quote';

export interface QuoteEventDetail {
  seq: number;
  backTo: string;
}

/**
 * Evidence link (T163; FR-047): the literal text of the stored message, linking to `#m{seq}`. On
 * activation (click or Enter) the transcript moves focus to the message, highlights it and inserts
 * "Volver al criterio". Without JavaScript it is a plain in-page link.
 */
export function QuoteLink({ quote, backTo }: { quote: Quote; backTo: string }) {
  return (
    <a
      href={`#${quote.anchor}`}
      data-testid="quote-link"
      className="block rounded-md border-l-4 border-accent bg-surface-sunken px-3 py-2 text-text underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      onClick={(event) => {
        event.preventDefault();
        window.history.replaceState(null, '', `#${quote.anchor}`);
        window.dispatchEvent(
          new CustomEvent<QuoteEventDetail>(QUOTE_EVENT, {
            detail: { seq: quote.seq, backTo },
          }),
        );
      }}
    >
      <span className="sr-only">Ver en la conversación: </span>“{quote.text}”
    </a>
  );
}
