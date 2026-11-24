'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states/error-state';

/** The (auth) layout already provides <main>: only the state is rendered here. */
export default function AuthError({
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
    <ErrorState title="Ocurrió un error inesperado" referenceId={error.digest} onRetry={reset} />
  );
}
