/**
 * `pnpm prompts:lock` (research.md §R3): adds the SHA-256 of every registered prompt version to
 * src/features/practice/ai/prompts/prompts.lock.json. Existing entries are never rewritten: if a
 * text changed under an already locked version, bump its PROMPT_VERSION instead.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashPrompt, PROMPTS, promptRef } from '../../src/features/practice/ai/prompts/registry';

const lockPath = fileURLToPath(
  new URL('../../src/features/practice/ai/prompts/prompts.lock.json', import.meta.url),
);
const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, string>;

let added = 0;
const conflicts: string[] = [];
for (const prompt of PROMPTS) {
  const ref = promptRef(prompt);
  const hash = hashPrompt(prompt.text);
  if (!lock[ref]) {
    lock[ref] = hash;
    added++;
  } else if (lock[ref] !== hash) {
    conflicts.push(ref);
  }
}

if (conflicts.length > 0) {
  console.error(
    `Text changed under a locked version: ${conflicts.join(', ')}. Bump PROMPT_VERSION and rerun.`,
  );
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(lockPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`prompts.lock.json: ${added} new version(s), ${Object.keys(sorted).length} total.`);
