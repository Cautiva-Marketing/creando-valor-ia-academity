'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Reference id shown to the user (Next error digest or our correlation id). */
  referenceId?: string;
  onRetry?: () => void;
}

/** Recoverable error with "Reintentar" and a reference id; never shows stack traces (FR-039/040). */
export function ErrorState({
  title = 'Algo salió mal',
  description = 'No pudimos cargar esta sección. Vuelve a intentarlo en unos segundos.',
  referenceId,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-12 text-center"
    >
      <AlertTriangle className="size-12 text-danger" aria-hidden="true" />
      <h1 className="text-2xl">{title}</h1>
      <p className="text-text-muted">{description}</p>
      {referenceId ? (
        <p className="text-sm text-text-muted">
          Referencia: <span className="font-mono font-semibold text-text">{referenceId}</span>
        </p>
      ) : null}
      {onRetry ? <Button onClick={onRetry}>Reintentar</Button> : null}
    </div>
  );
}
