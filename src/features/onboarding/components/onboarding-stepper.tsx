'use client';

import { CheckCircle2, Compass, MessagesSquare, PartyPopper } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Progress } from '@/components/ui/progress';
import { completeOnboarding, setOnboardingStep, skipOnboarding } from '../actions';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from '../steps';

const ICONS = [PartyPopper, MessagesSquare, Compass] as const;

/**
 * 3-step onboarding (FR-034): "Paso n de 3" with a progress bar, Anterior / Siguiente / Saltar.
 * Each move is persisted so the seller resumes on the step reached.
 */
export function OnboardingStepper({
  initialStep,
  firstName,
}: {
  initialStep: number;
  firstName?: string;
}) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), ONBOARDING_STEP_COUNT));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const content = ONBOARDING_STEPS[step - 1]!;
  const Icon = ICONS[step - 1]!;
  const last = step === ONBOARDING_STEP_COUNT;

  // Move focus to the new step's title (not on first render).
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);

  const goTo = (target: number) =>
    startTransition(async () => {
      const result = await setOnboardingStep({ step: target });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      moved.current = true;
      setStep(target);
    });

  const run = (action: () => Promise<{ ok: boolean; message?: string } | undefined | void>) =>
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.message ?? null);
    });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text-muted" aria-live="polite">
          Paso {step} de {ONBOARDING_STEP_COUNT}
        </p>
        <Progress
          value={step}
          max={ONBOARDING_STEP_COUNT}
          aria-label={`Progreso del onboarding: paso ${step} de ${ONBOARDING_STEP_COUNT}`}
        />
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Card>
        <CardHeader>
          <Icon className="size-8 text-primary" aria-hidden="true" />
          <CardTitle as="h1" className="text-2xl focus:outline-none" ref={headingRef} tabIndex={-1}>
            {step === 1 && firstName
              ? `${firstName}, ${content.title.charAt(0).toLowerCase()}${content.title.slice(1)}`
              : content.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>{content.body}</p>
          <ul className="flex flex-col gap-2">
            {content.points.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={() => run(skipOnboarding)} disabled={pending}>
            Saltar
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step > 1 ? (
              <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={pending}>
                Anterior
              </Button>
            ) : null}
            {last ? (
              <Button
                onClick={() => run(completeOnboarding)}
                loading={pending}
                loadingLabel="Guardando…"
              >
                Registrar mi producto
              </Button>
            ) : (
              <Button onClick={() => goTo(step + 1)} loading={pending} loadingLabel="Guardando…">
                Siguiente
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
