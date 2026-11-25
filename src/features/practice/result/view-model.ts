import type { Database } from '@/lib/supabase/database.types';
import { cautivaLabel, type CautivaStage } from '../domain/cautiva';
import { ETHICAL_FLAG_LABELS, REVEALABLE_LABELS } from '../domain/labels';
import { confidenceLabel } from '../domain/scoring';

/**
 * Result screen view model (T161; FR-046, FR-047). Pure. Quotes always take the literal `content` of
 * the stored message (never evaluator text) and only from seller messages of the transcript.
 */
type Enums = Database['public']['Enums'];

export interface ResultSource {
  criteria: Array<{
    key: string;
    name: string;
    position: number;
    stages: CautivaStage[];
    status: Enums['criterion_status'];
    score: number | null;
    maxScore: number;
    evidenceSeqs: number[];
    justification: string;
    improvement: string;
    confidence: number;
  }>;
  flags: Array<{ type: Enums['ethical_flag_type']; explanation: string; messageSeqs: number[] }>;
  messages: Array<{ seq: number; author: 'seller' | 'buyer'; content: string }>;
  /** Secrets are readable by the owner once the session ended (RLS). */
  secrets: {
    motivation: string;
    personality: string;
    revealables: Array<{ key: string; value: string }>;
    hiddenObjections: Array<{ id: string; text: string }>;
  } | null;
  reveals: Array<{ kind: string; key: string; messageSeq: number }>;
}

export interface Quote {
  seq: number;
  anchor: string;
  text: string;
}

export interface CriterionView {
  key: string;
  name: string;
  stages: Array<{ stage: CautivaStage; label: string }>;
  evaluated: boolean;
  score: number | null;
  maxScore: number;
  justification: string;
  improvement: string;
  confidence: 'Alta' | 'Media' | 'Baja';
  quotes: Quote[];
}

export interface ResultViewModel {
  criteria: CriterionView[];
  /** At least one evaluated criterion; otherwise "Sin evidencia suficiente para calificar". */
  hasScore: boolean;
  flags: Array<{
    type: Enums['ethical_flag_type'];
    label: string;
    explanation: string;
    quotes: Quote[];
  }>;
  revealables: Array<{
    key: string;
    label: string;
    value: string;
    discovered: boolean;
    messageSeq: number | null;
  }>;
  hiddenObjections: Array<{ id: string; text: string; raised: boolean; messageSeq: number | null }>;
  motivation: string | null;
  personality: string | null;
}

export const NO_SCORE_TEXT = 'Sin evidencia suficiente para calificar';

function quotesFor(seqs: readonly number[], sellerMessages: ReadonlyMap<number, string>): Quote[] {
  const quotes: Quote[] = [];
  for (const seq of seqs) {
    const text = sellerMessages.get(seq);
    if (text === undefined || quotes.some((q) => q.seq === seq)) continue;
    quotes.push({ seq, anchor: `m${seq}`, text });
  }
  return quotes;
}

export function buildResultViewModel(source: ResultSource): ResultViewModel {
  const seller = new Map(
    source.messages.filter((m) => m.author === 'seller').map((m) => [m.seq, m.content]),
  );
  const criteria = [...source.criteria]
    .sort((a, b) => a.position - b.position)
    .map((c) => {
      const evaluated = c.status === 'evaluated' && c.score !== null;
      return {
        key: c.key,
        name: c.name,
        stages: c.stages.map((stage) => ({ stage, label: cautivaLabel(stage) })),
        evaluated,
        score: evaluated ? c.score : null,
        maxScore: c.maxScore,
        justification: c.justification,
        improvement: c.improvement,
        confidence: confidenceLabel(c.confidence),
        quotes: evaluated ? quotesFor(c.evidenceSeqs, seller) : [],
      };
    });

  const revealedAt = (kind: string, key: string) =>
    source.reveals.find((r) => r.kind === kind && r.key === key)?.messageSeq ?? null;

  return {
    criteria,
    hasScore: criteria.some((c) => c.evaluated),
    flags: source.flags.map((f) => ({
      type: f.type,
      label: ETHICAL_FLAG_LABELS[f.type],
      explanation: f.explanation,
      quotes: quotesFor(f.messageSeqs, seller),
    })),
    revealables: (source.secrets?.revealables ?? []).map((r) => {
      const messageSeq = revealedAt('revealable', r.key);
      return {
        key: r.key,
        label: REVEALABLE_LABELS[r.key as Enums['revealable_key']] ?? r.key,
        value: r.value,
        discovered: messageSeq !== null,
        messageSeq,
      };
    }),
    hiddenObjections: (source.secrets?.hiddenObjections ?? []).map((o) => {
      const messageSeq = revealedAt('hidden_objection', o.id);
      return { id: o.id, text: o.text, raised: messageSeq !== null, messageSeq };
    }),
    motivation: source.secrets?.motivation ?? null,
    personality: source.secrets?.personality ?? null,
  };
}
