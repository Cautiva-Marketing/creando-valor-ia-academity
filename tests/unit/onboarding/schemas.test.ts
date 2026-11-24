import { describe, expect, it } from 'vitest';
import { onboardingStepSchema } from '@/features/onboarding/schemas';

describe('onboardingStepSchema (profiles.onboarding_step 1–3)', () => {
  it('accepts only 1, 2 and 3', () => {
    for (const step of [1, 2, 3]) expect(onboardingStepSchema.parse({ step })).toEqual({ step });
  });
  it('rejects 0, 4, decimals and text', () => {
    for (const step of [0, 4, 1.5, '2', 'dos', null, undefined]) {
      expect(onboardingStepSchema.safeParse({ step }).success).toBe(false);
    }
  });
});
