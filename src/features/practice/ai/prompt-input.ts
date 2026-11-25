/**
 * Prompt input hygiene (research.md §R3, AC-09). Untrusted data (product, objections, persona,
 * transcript) is never concatenated into the system prompt as free text: it travels in delimited
 * blocks serialized as JSON with `<` and `>` escaped, so content can never close or open a block.
 * The system prompts state that everything inside a block is information, never instructions.
 */

/** Hard cap of the full prompt (system + data + messages), verified before every call. */
export const MAX_PROMPT_CHARS = 60_000;

const TAG = /^[a-z][a-z0-9_]*$/;

export class PromptTooLargeError extends Error {
  override readonly name = 'PromptTooLargeError';
  constructor(readonly size: number) {
    super(`prompt of ${size} characters exceeds ${MAX_PROMPT_CHARS}`);
  }
}

/** `<tag>\n{json}\n</tag>` with delimiters neutralized inside the JSON (still valid JSON). */
export function dataBlock(tag: string, value: unknown): string {
  if (!TAG.test(tag)) throw new Error(`invalid data block tag: ${tag}`);
  const json = JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `<${tag}>\n${json}\n</${tag}>`;
}

/** Trims and truncates a text to its documented limit before it reaches a prompt. */
export function clip(text: string, max: number): string {
  return text.trim().slice(0, max);
}

export function assertPromptSize(parts: readonly string[]): void {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  if (size > MAX_PROMPT_CHARS) throw new PromptTooLargeError(size);
}
