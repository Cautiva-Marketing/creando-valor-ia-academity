import { isPublicFigureName, normalizeName } from './public-figures';
import type { BuyerSetupOutput } from './schemas';

/**
 * Domain rules of a generated persona (contracts/ai-agents.md → validatePersona; FR-012, FR-013).
 * Runs after the Zod schema; a persona with issues is retried (≤ 3 attempts) and never stored.
 */
export interface PersonaContext {
  priceMin: number;
  priceMax: number;
  /** Objections the seller chose (1–3). */
  selectedCount: number;
  /** Texts of the chosen objections that stay hidden (0–2). */
  hiddenObjectionTexts: readonly string[];
}

export type PersonaIssue =
  | 'budget_out_of_range'
  | 'generated_hidden_objection'
  | 'opening_mentions_budget'
  | 'opening_mentions_hidden_objection'
  | 'public_figure';

export type PersonaValidation = { ok: true } | { ok: false; issues: PersonaIssue[] };

/** Budget of the buyer: between 70 % of the minimum and 130 % of the maximum price (FR-012). */
export function budgetBounds(priceMin: number, priceMax: number) {
  return {
    min: Math.round(priceMin * 0.7 * 100) / 100,
    max: Math.round(priceMax * 1.3 * 100) / 100,
  };
}

/** Numbers written in a text ("1 300", "1,300", "1.300,50", "700") as values. */
function numbersIn(value: string): number[] {
  const matches = value.match(/\d{1,3}(?:[\s., ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g);
  if (!matches) return [];
  return matches.map((raw) => {
    const compact = raw.replace(/[\s ]/g, '');
    // Last separator followed by 1–2 digits is the decimal mark; others group thousands.
    const decimal = /[.,](\d{1,2})$/.exec(compact);
    const integer = (decimal ? compact.slice(0, -decimal[0].length) : compact).replace(/[.,]/g, '');
    return Number(decimal ? `${integer}.${decimal[1]}` : integer);
  });
}

const STOPWORDS = new Set(['porque', 'cuando', 'tengo', 'tiene', 'sobre', 'estoy', 'puede']);

function contentWords(value: string): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((word) => word.length >= 5 && !STOPWORDS.has(word));
}

/** The opening raises a hidden objection: same text, or most of its content words. */
function mentions(opening: string, objection: string): boolean {
  const normalizedOpening = normalizeName(opening);
  const normalizedObjection = normalizeName(objection);
  if (normalizedObjection.length > 0 && normalizedOpening.includes(normalizedObjection))
    return true;
  const words = contentWords(objection);
  if (words.length < 3) return false;
  const openingWords = new Set(normalizedOpening.split(' '));
  const shared = words.filter((word) => openingWords.has(word)).length;
  return shared / words.length >= 0.75;
}

export function validatePersona(
  output: BuyerSetupOutput,
  context: PersonaContext,
): PersonaValidation {
  const issues: PersonaIssue[] = [];
  const { budget } = output.revealables;
  const bounds = budgetBounds(context.priceMin, context.priceMax);
  if (budget.amount_min < bounds.min || budget.amount_max > bounds.max) {
    issues.push('budget_out_of_range');
  }

  const wantsGenerated = context.selectedCount === 1;
  if (wantsGenerated !== Boolean(output.generated_hidden_objection)) {
    issues.push('generated_hidden_objection');
  }

  const opening = output.opening_message;
  const amounts = new Set([budget.amount_min, budget.amount_max]);
  const displayMentioned =
    normalizeName(budget.display).length > 3 &&
    normalizeName(opening).includes(normalizeName(budget.display));
  if (displayMentioned || numbersIn(opening).some((n) => amounts.has(n))) {
    issues.push('opening_mentions_budget');
  }

  const hidden = [
    ...context.hiddenObjectionTexts,
    ...(output.generated_hidden_objection ? [output.generated_hidden_objection.text] : []),
  ];
  if (hidden.some((objection) => mentions(opening, objection))) {
    issues.push('opening_mentions_hidden_objection');
  }

  if (isPublicFigureName(output.buyer.name)) issues.push('public_figure');

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
