import type { RevealableKey } from './schemas';

/**
 * Deterministic output guards of the buyer (research.md §R3; FR-032, FR-033, AC-09):
 *
 * 1. Out of role: the reply talks about instructions/prompts, says it is an AI, a model or an
 *    assistant, or gives explicit sales advice → the turn is regenerated (counts as invalid metadata).
 * 2. Reveal coherence: the reply contains the literal value of a revealable not declared in the
 *    metadata → the server records it as revealed so the panel tells the truth.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/]+/gu, ' ')
    .trim();
}

const OUT_OF_ROLE: readonly RegExp[] = [
  // talking about its own instructions or prompt
  /\b(mis|tus|estas|las) instrucciones (del sistema|que me dieron|que me diste|son|dicen)\b/,
  /\b(mis|tus) instrucciones\b/,
  /\b(system )?prompt\b/,
  // being an AI / a model / an assistant
  /\bmodelo de (lenguaje|ia|inteligencia artificial)\b/,
  /\binteligencia artificial\b/,
  /\bsoy (un|una) (ia|asistente|modelo|bot|chatbot|programa)\b/,
  /\bcomo (ia|asistente|modelo de lenguaje)\b/,
  /\b(chatgpt|gemini|openai|anthropic|claude)\b/,
  // explicit sales advice (the buyer is not a coach)
  /\b(consejo|consejos|tip|tips|tecnica|tecnicas) (de|para) (venta|ventas|vender|cerrar)\b/,
  /\bpara (vender|cerrar|negociar) mejor\b/,
  /\bun buen vendedor (deberia|tendria|tiene que|haria)\b/,
  /\bcomo vendedor (deberias|tienes que|te conviene)\b/,
  /\b(deberias|te recomiendo) (preguntarme|indagar|hacer mas preguntas|escuchar mas)\b/,
];

/** Standalone "IA" in the original casing (normalization would collide with words like "dia"). */
const AI_ACRONYM = /(^|[^\p{L}])I\.?A\.?([^\p{L}]|$)/u;

export function isOutOfRole(reply: string): boolean {
  if (AI_ACRONYM.test(reply)) return true;
  const text = normalize(reply);
  return OUT_OF_ROLE.some((pattern) => pattern.test(text));
}

/** Shorter values ("Sí") would match ordinary words; they are left to the model's metadata. */
const MIN_LITERAL = 6;

/**
 * Revealable keys whose literal value appears in the reply without being declared in
 * `meta.revealed` (nor revealed before).
 */
export function undeclaredReveals(
  reply: string,
  revealables: ReadonlyArray<{ key: RevealableKey; value: string }>,
  declared: readonly RevealableKey[],
  alreadyRevealed: readonly RevealableKey[],
): RevealableKey[] {
  const text = ` ${normalize(reply)} `;
  return revealables
    .filter((r) => !declared.includes(r.key) && !alreadyRevealed.includes(r.key))
    .filter((r) => {
      const value = normalize(r.value);
      return value.length >= MIN_LITERAL && text.includes(` ${value} `);
    })
    .map((r) => r.key);
}
