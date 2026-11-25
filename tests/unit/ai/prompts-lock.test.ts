import { describe, expect, it } from 'vitest';
import {
  checkPromptsLock,
  hashPrompt,
  PROMPTS,
  type PromptDefinition,
} from '@/features/practice/ai/prompts/registry';
import lock from '@/features/practice/ai/prompts/prompts.lock.json';

/**
 * T035 (research.md §R3, Principle VII): a prompt version is immutable. Changing a prompt text without
 * bumping its PROMPT_VERSION makes this test fail; run `pnpm prompts:lock` after bumping.
 */

describe('prompts.lock.json', () => {
  it('has an entry with the same SHA-256 for every registered prompt version', () => {
    expect(checkPromptsLock(PROMPTS, lock)).toEqual([]);
  });

  it('registers each prompt id once with a semver version', () => {
    const ids = PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prompt of PROMPTS) expect(prompt.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('checkPromptsLock', () => {
  const prompt: PromptDefinition = { id: 'demo', version: '1.0.0', text: 'Eres un comprador.' };

  it('reports a changed text under the same version', () => {
    const stale = { 'demo@1.0.0': hashPrompt('Texto anterior') };
    expect(checkPromptsLock([prompt], stale)).toEqual([
      'demo@1.0.0: text changed without bumping PROMPT_VERSION',
    ]);
  });

  it('reports a version missing from the lock', () => {
    expect(checkPromptsLock([prompt], {})).toEqual([
      'demo@1.0.0: missing from prompts.lock.json (run pnpm prompts:lock)',
    ]);
  });

  it('passes when the hash matches and keeps historical versions', () => {
    const current = { 'demo@0.9.0': 'old', 'demo@1.0.0': hashPrompt(prompt.text) };
    expect(checkPromptsLock([prompt], current)).toEqual([]);
  });

  it('versions are referenced as id@version', () => {
    expect(hashPrompt('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
