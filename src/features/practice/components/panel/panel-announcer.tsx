'use client';

import { useEffect, useRef, useState } from 'react';
import { MOOD_LABELS } from '../../domain/mood';
import type { PublicState } from '../../stream/protocol';
import { formatDelta } from './thermometer';

/**
 * Single polite announcer of the panel (T119/T120): interest changes (debounced so they do not cut
 * the buyer's reply), new discoveries ("Descubriste: Presupuesto") and the end of the time. Rendered
 * once, outside the responsive panel copies, so it works on desktop and in the mobile layout.
 */
export function PanelAnnouncer({ state, onTimeUp }: { state: PublicState; onTimeUp?: () => void }) {
  const [interestMessage, setInterestMessage] = useState('');
  const [revealMessage, setRevealMessage] = useState('');
  const firstInterest = useRef(true);
  const known = useRef(new Set(state.reveals.map((r) => `${r.kind}:${r.key}`)));
  const moodLabel = MOOD_LABELS[state.mood];

  useEffect(() => {
    if (firstInterest.current) {
      firstInterest.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const change = state.lastDelta != null ? ` (${formatDelta(state.lastDelta)})` : '';
      setInterestMessage(`Interés ${state.interest} de 100, ${moodLabel}${change}`);
    }, 800);
    return () => clearTimeout(timer);
  }, [state.interest, state.lastDelta, state.sellerMessageCount, moodLabel]);

  useEffect(() => {
    const fresh = state.reveals.filter((r) => !known.current.has(`${r.kind}:${r.key}`));
    for (const r of fresh) known.current.add(`${r.kind}:${r.key}`);
    if (fresh.length > 0) setRevealMessage(`Descubriste: ${fresh.map((r) => r.label).join(', ')}`);
  }, [state.reveals]);

  useEffect(() => {
    if (!onTimeUp) return;
    const ms = new Date(state.deadlineAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return;
    const timer = setTimeout(onTimeUp, Math.max(0, ms) + 1500);
    return () => clearTimeout(timer);
  }, [onTimeUp, state.deadlineAt]);

  return (
    <div className="sr-only">
      <p aria-live="polite" data-testid="thermometer-announcement">
        {interestMessage}
      </p>
      <p aria-live="polite" data-testid="reveal-announcement">
        {revealMessage}
      </p>
    </div>
  );
}
