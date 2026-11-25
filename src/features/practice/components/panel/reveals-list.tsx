'use client';

import { KeyRound, Lock, MessageSquareWarning } from 'lucide-react';
import { REVEALABLE_LABELS } from '../../domain/labels';
import type { PublicReveal } from '../../stream/protocol';

type RevealableKey = keyof typeof REVEALABLE_LABELS;

function focusMessage(seq: number) {
  const target = document.getElementById(`m${seq}`);
  if (!target) return;
  target.scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
}

/**
 * Data to discover (T120; FR-025): locked labels until revealed, then the value with a link to the
 * message where it appeared; discovered hidden objections (announced by PanelAnnouncer).
 */
export function RevealsList({
  labels,
  reveals,
  onNavigate,
}: {
  labels: readonly RevealableKey[];
  reveals: PublicReveal[];
  /** Called before jumping to a message (e.g. to close the bottom sheet). */
  onNavigate?: () => void;
}) {
  const byKey = new Map(reveals.filter((r) => r.kind === 'revealable').map((r) => [r.key, r]));
  const hidden = reveals.filter((r) => r.kind === 'hidden_objection');
  const jump = (seq: number) => {
    onNavigate?.();
    // after the sheet closes and returns focus
    setTimeout(() => focusMessage(seq), 0);
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base">Datos por descubrir</h3>
      <ul className="flex flex-col gap-2" data-testid="reveals-list">
        {labels.map((key) => {
          const reveal = byKey.get(key);
          return (
            <li
              key={key}
              data-testid={`reveal-${key}`}
              data-state={reveal ? 'unlocked' : 'locked'}
              className="flex flex-col gap-1 rounded-md border border-border p-3"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {reveal ? (
                  <KeyRound className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <Lock className="size-4 text-text-muted" aria-hidden="true" />
                )}
                {REVEALABLE_LABELS[key]}
                {reveal ? null : <span className="font-normal text-text-muted">· Bloqueado</span>}
              </span>
              {reveal ? (
                <>
                  <span>{reveal.value}</span>
                  <a
                    href={`#m${reveal.messageSeq}`}
                    className="text-sm text-primary underline"
                    onClick={(event) => {
                      event.preventDefault();
                      jump(reveal.messageSeq);
                    }}
                  >
                    Ver el mensaje
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      {hidden.length > 0 ? (
        <>
          <h3 className="text-base">Objeciones descubiertas</h3>
          <ul className="flex flex-col gap-2" data-testid="hidden-objections">
            {hidden.map((reveal) => (
              <li
                key={reveal.key}
                className="flex flex-col gap-1 rounded-md border border-warning p-3"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquareWarning className="size-4 text-warning" aria-hidden="true" />
                  {reveal.label}
                </span>
                <span>{reveal.value}</span>
                <a
                  href={`#m${reveal.messageSeq}`}
                  className="text-sm text-primary underline"
                  onClick={(event) => {
                    event.preventDefault();
                    jump(reveal.messageSeq);
                  }}
                >
                  Ver el mensaje
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
