'use client';

import { useEffect, useRef } from 'react';
import type { PublicReveal } from '../../stream/protocol';
import { MessageBubble } from './message-bubble';
import type { TurnPhase, UiMessage } from './use-turn-stream';

/**
 * Conversation (T116): `role="log"`; the streamed text lives in an `aria-hidden` node and the full
 * reply is announced once through a polite region; "escribiendo…" is a status.
 */
export function ChatView({
  messages,
  buyerName,
  phase,
  streamingText,
  announcement,
  reveals,
  onRetry,
}: {
  messages: UiMessage[];
  buyerName: string;
  phase: TurnPhase;
  streamingText: string;
  announcement: string;
  reveals: PublicReveal[];
  onRetry: (key: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, streamingText, phase]);

  const revealedAt = new Map<number, string[]>();
  for (const reveal of reveals) {
    revealedAt.set(reveal.messageSeq, [...(revealedAt.get(reveal.messageSeq) ?? []), reveal.label]);
  }
  const busy = phase !== 'idle';

  return (
    <section aria-label="Conversación" className="flex flex-col gap-3">
      <div role="log" aria-label={`Conversación con ${buyerName}`}>
        <ol className="flex flex-col gap-3">
          {messages.map((message) => (
            <MessageBubble
              key={message.key}
              message={message}
              buyerName={buyerName}
              revealedHere={message.seq != null ? revealedAt.get(message.seq) : undefined}
              onRetry={message.author === 'seller' ? onRetry : undefined}
              retryDisabled={busy}
            />
          ))}
        </ol>
      </div>

      {streamingText ? (
        <div
          aria-hidden="true"
          data-testid="streaming-reply"
          className="max-w-prose self-start rounded-lg rounded-bl-sm border border-border bg-surface-raised px-4 py-2 break-words whitespace-pre-wrap"
        >
          {streamingText}
        </div>
      ) : null}

      <div role="status" className="min-h-6 text-sm text-text-muted" data-testid="typing">
        {phase === 'retrying'
          ? 'El cliente está tardando, reintentando…'
          : phase === 'waiting' || phase === 'streaming'
            ? `${buyerName} está escribiendo…`
            : ''}
      </div>
      <div aria-live="polite" className="sr-only" data-testid="reply-announcement">
        {announcement}
      </div>
      <div ref={endRef} />
    </section>
  );
}
