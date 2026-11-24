'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states/error-state';
import '@/styles/globals.css';

/** Last-resort error boundary (replaces the root layout). No stack traces (FR-039, FR-040). */
export default function GlobalError({
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
    <html lang="es">
      <body>
        <main id="contenido" className="flex min-h-dvh items-center justify-center px-4">
          <div className="flex flex-col items-center gap-2">
            <p className="font-display text-xl font-bold text-primary">Creando Valor IA™</p>
            <ErrorState
              title="Ocurrió un error inesperado"
              description="Vuelve a intentarlo en unos segundos."
              referenceId={error.digest}
              onRetry={reset}
            />
          </div>
        </main>
      </body>
    </html>
  );
}
