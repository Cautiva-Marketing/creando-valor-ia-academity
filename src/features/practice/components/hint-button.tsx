'use client';

import { Lightbulb } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { requestHint } from '../actions';

/**
 * Contextual hint (T122; FR-031): one per seller turn, from the fixed catalog. Only rendered when the
 * practice has hints enabled.
 */
export function HintButton({
  sessionId,
  available,
  turn,
}: {
  sessionId: string;
  available: boolean;
  /** Seller message count: a new turn hides the previous hint. */
  turn: number;
}) {
  const [hint, setHint] = useState<{ turn: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = hint && hint.turn === turn ? hint.text : null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={!available || pending || shown != null}
        aria-describedby={!available ? 'hint-help' : undefined}
        onClick={() => {
          setError(null);
          const formData = new FormData();
          formData.set('sessionId', sessionId);
          startTransition(async () => {
            const result = await requestHint(null, formData);
            if (result.ok) setHint({ turn, text: result.data.hint });
            else setError(result.message);
          });
        }}
      >
        <Lightbulb aria-hidden="true" />
        {pending ? 'Buscando una pista…' : 'Pedir una pista'}
      </Button>
      {!available && !shown ? (
        <p id="hint-help" className="text-sm text-text-muted">
          Ya usaste la pista de este turno. Envía un mensaje para pedir otra.
        </p>
      ) : null}
      {shown ? (
        <FormAlert tone="info" title="Pista" data-testid="hint">
          {shown}
        </FormAlert>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </div>
  );
}
