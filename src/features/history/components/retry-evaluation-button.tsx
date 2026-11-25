'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { retryEvaluation } from '../../practice/actions';

/** "Reintentar evaluación" from the history (FR-043): no quota is consumed. */
export function RetryEvaluationButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      loadingLabel="Reintentando…"
      onClick={() => {
        const formData = new FormData();
        formData.set('sessionId', sessionId);
        startTransition(async () => {
          const result = await retryEvaluation(null, formData);
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          router.push(`/practicas/${sessionId}`);
        });
      }}
    >
      <RotateCcw aria-hidden="true" />
      Reintentar evaluación
    </Button>
  );
}
