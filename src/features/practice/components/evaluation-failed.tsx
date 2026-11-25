'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { retryEvaluation } from '../actions';

/**
 * Failed evaluation (T154; FR-043): "Reintentar evaluación" with the retries left (max 3 per session,
 * without consuming quota). `unavailable` is final: no button, the transcript stays available.
 */
export function EvaluationFailed({
  sessionId,
  manualRetriesLeft,
  unavailable = false,
}: {
  sessionId: string;
  manualRetriesLeft: number;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (unavailable || manualRetriesLeft === 0) {
    return (
      <section
        data-testid="evaluation-unavailable"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4"
      >
        <h2 className="text-xl">Evaluación no disponible</h2>
        <p className="text-text-muted">
          No pudimos evaluar esta práctica después de varios intentos. Tu conversación sigue
          disponible abajo y la simulación ya contó en tu cuota.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="evaluation-failed"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl">La evaluación falló</h2>
        <p className="text-text-muted">
          No pudimos completar la evaluación. Puedes reintentarla sin usar otra simulación.
        </p>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={pending}
          loadingLabel="Reintentando…"
          onClick={() => {
            const formData = new FormData();
            formData.set('sessionId', sessionId);
            setError(null);
            startTransition(async () => {
              const result = await retryEvaluation(null, formData);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              router.refresh();
            });
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reintentar evaluación
        </Button>
        <p className="text-sm text-text-muted" data-testid="retries-left">
          {manualRetriesLeft === 1
            ? 'Te queda 1 reintento'
            : `Te quedan ${manualRetriesLeft} reintentos`}
        </p>
      </div>
    </section>
  );
}
