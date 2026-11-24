import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resumeOnboarding } from '../actions';
import { ONBOARDING_STEP_COUNT } from '../steps';

/** Shown on /inicio when the onboarding was skipped or left in progress (FR-034). */
export function ResumeOnboardingCard({ step }: { step: number }) {
  return (
    <Card>
      <CardHeader>
        <Compass className="size-6 text-primary" aria-hidden="true" />
        <CardTitle as="h2">Retoma tu recorrido de bienvenida</CardTitle>
        <CardDescription>
          Te quedaste en el paso {step} de {ONBOARDING_STEP_COUNT}. Son menos de dos minutos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={async () => {
            'use server';
            await resumeOnboarding();
          }}
        >
          <Button type="submit" variant="secondary">
            Retomar onboarding
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
