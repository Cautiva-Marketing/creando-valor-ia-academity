'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states/error-state';

/** The (public) layout already provides <main>: only the state is rendered here. */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="px-4">
      <ErrorState
        title="Ocurrió un error inesperado"
        description="No es tu culpa. Vuelve a intentarlo; si el problema continúa, comparte la referencia con soporte."
        referenceId={error.digest}
        onRetry={reset}
      />
    </div>
  );
}
