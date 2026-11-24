import { z } from 'zod';

/** data-model.md `profiles.onboarding_step`: smallint CHECK 1–3. */
export const onboardingStepSchema = z.object({
  step: z.literal([1, 2, 3], { error: 'Paso no válido.' }),
});

export type OnboardingStepNumber = z.infer<typeof onboardingStepSchema>['step'];
