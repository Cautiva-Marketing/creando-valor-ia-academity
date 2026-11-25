import { createHash } from 'node:crypto';
import { BUYER_PROMPT } from './buyer';
import { BUYER_SETUP_PROMPT } from './buyer-setup';
import { EVALUATOR_PROMPT } from './evaluator';

/**
 * Versioned system prompts (research.md §R3, FR-035, FR-044, Principle VII). Each prompt has an id and
 * a semver version recorded on sessions (`buyer_setup_prompt_version`, `buyer_prompt_version`) and
 * evaluations (`prompt_version`) as `id@version`. `prompts.lock.json` stores the SHA-256 of every
 * published version; a test fails when a text changes without a version bump.
 */
export interface PromptDefinition {
  id: string;
  version: string;
  text: string;
}

/** Registered prompts (buyer-setup, buyer, evaluator). */
export const PROMPTS: readonly PromptDefinition[] = [
  BUYER_SETUP_PROMPT,
  BUYER_PROMPT,
  EVALUATOR_PROMPT,
];

export function promptRef(prompt: Pick<PromptDefinition, 'id' | 'version'>): string {
  return `${prompt.id}@${prompt.version}`;
}

export function hashPrompt(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Lock problems of the registered prompts (empty when consistent). */
export function checkPromptsLock(
  prompts: readonly PromptDefinition[],
  lock: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const prompt of prompts) {
    const ref = promptRef(prompt);
    const locked = lock[ref];
    if (!locked) problems.push(`${ref}: missing from prompts.lock.json (run pnpm prompts:lock)`);
    else if (locked !== hashPrompt(prompt.text)) {
      problems.push(`${ref}: text changed without bumping PROMPT_VERSION`);
    }
  }
  return problems;
}
