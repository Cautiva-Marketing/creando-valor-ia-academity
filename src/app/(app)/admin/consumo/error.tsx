'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states/error-state';

export default function UsageError({
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
    <ErrorState title="No pudimos cargar el consumo" referenceId={error.digest} onRetry={reset} />
  );
}
