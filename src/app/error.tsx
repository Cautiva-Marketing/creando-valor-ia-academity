'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Logo } from '@/components/brand/logo';
import { ErrorState } from '@/components/states/error-state';

export default function GlobalRouteError({
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
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4"
    >
      <Logo />
      <ErrorState
        title="Ocurrió un error inesperado"
        description="No es tu culpa. Vuelve a intentarlo; si el problema continúa, comparte la referencia con soporte."
        referenceId={error.digest}
        onRetry={reset}
      />
    </main>
  );
}
