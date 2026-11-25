'use client';

import { CornerUpLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '../../queries';
import { messageAnchor } from '../../stream/protocol';
import { QUOTE_EVENT, type QuoteEventDetail } from './quote-link';

/**
 * Full transcript of a finished practice (T154, T167) with anchors `m{seq}`. A quote of the result
 * (QuoteLink) moves the focus here, highlights the message (`--color-highlight`) and inserts
 * "Volver al criterio", which returns the focus to the criterion (contracts/routes.md → Anclas).
 */
export function Transcript({
  messages,
  buyerName,
}: {
  messages: readonly ChatMessage[];
  buyerName: string;
}) {
  const [active, setActive] = useState<QuoteEventDetail | null>(null);
  const focusNext = useRef(false);

  useEffect(() => {
    const onQuote = (event: Event) => {
      focusNext.current = true;
      setActive((event as CustomEvent<QuoteEventDetail>).detail);
    };
    // A quote followed natively (before hydration, or a shared #mN link): the origin is the focused
    // quote's criterion or the flags block; otherwise the breakdown.
    const fromHash = () => {
      const match = /^#m(\d+)$/.exec(window.location.hash);
      if (!match) return;
      const origin = document.activeElement?.closest('[id^="criterio-"], #banderas-eticas');
      focusNext.current = true;
      setActive({ seq: Number(match[1]), backTo: origin?.id ?? 'criteria-title' });
    };
    window.addEventListener(QUOTE_EVENT, onQuote);
    window.addEventListener('hashchange', fromHash);
    fromHash();
    return () => {
      window.removeEventListener(QUOTE_EVENT, onQuote);
      window.removeEventListener('hashchange', fromHash);
    };
  }, []);

  useEffect(() => {
    if (!active || !focusNext.current) return;
    focusNext.current = false;
    const target = document.getElementById(messageAnchor(active.seq));
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center' });
  }, [active]);

  const back = () => {
    if (!active) return;
    const target = document.getElementById(active.backTo);
    window.history.replaceState(null, '', `#${active.backTo}`);
    setActive(null);
    if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  };

  return (
    <section aria-labelledby="transcript-title" className="flex flex-col gap-3">
      <h2 id="transcript-title" className="text-xl">
        Conversación
      </h2>
      <ol className="flex flex-col gap-3" data-testid="transcript">
        {messages.map((m) => {
          const seller = m.author === 'seller';
          const highlighted = active?.seq === m.seq;
          return (
            <li
              key={m.seq}
              id={messageAnchor(m.seq)}
              tabIndex={-1}
              data-testid="transcript-message"
              data-author={m.author}
              data-highlighted={highlighted || undefined}
              className={cn(
                'flex max-w-prose scroll-mt-24 flex-col gap-2 rounded-lg px-4 py-2 break-words whitespace-pre-wrap focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                seller
                  ? 'self-end rounded-br-sm bg-primary text-on-primary'
                  : 'self-start rounded-bl-sm border border-border bg-surface-raised text-text',
                highlighted && 'bg-highlight text-on-highlight ring-2 ring-accent',
              )}
            >
              <span>
                <span className="sr-only">{seller ? 'Tú:' : `${buyerName}:`} </span>
                {m.content}
              </span>
              {highlighted ? (
                <a
                  href={`#${active.backTo}`}
                  onClick={(event) => {
                    event.preventDefault();
                    back();
                  }}
                  className="inline-flex items-center gap-1 self-start text-sm font-semibold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <CornerUpLeft className="size-4" aria-hidden="true" />
                  {active.backTo === 'banderas-eticas'
                    ? 'Volver a las alertas'
                    : 'Volver al criterio'}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
