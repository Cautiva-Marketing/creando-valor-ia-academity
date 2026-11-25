import type { RevealableKey } from '../ai/schemas';
import type { CautivaStage } from '../domain/cautiva';
import { REVEALABLE_ENTRIES, SITUATION_ENTRIES, STAGE_ENTRIES, type CatalogEntry } from './catalog';

/**
 * Hint and idea selection (research.md §R11; FR-031). Pure and deterministic. The input type only
 * admits keys and flags: there is no field where a hidden value could travel.
 */
export interface HintState {
  sellerMessageCount: number;
  messagesLeft: number;
  interest: number;
  focusStage: CautivaStage | null;
  /** Revealable keys of the persona not discovered yet (labels are public, values are not). */
  pendingRevealables: readonly RevealableKey[];
  /** Whether a hidden objection has not been raised yet. */
  hiddenObjectionPending: boolean;
}

export interface Hint {
  id: string;
  text: string;
}

export interface Idea {
  id: string;
  text: string;
}

const LOW_MESSAGES = 3;
const DISTRUSTFUL_BELOW = 30;
const REVEAL_ORDER: readonly RevealableKey[] = ['budget', 'timeline', 'decision_maker'];

/** Urgent entries first (fixed priority), then the situational ones that rotate by turn. */
function candidates(state: HintState): { urgent: CatalogEntry[]; rotating: CatalogEntry[] } {
  const urgent: CatalogEntry[] = [];
  if (state.messagesLeft <= LOW_MESSAGES) urgent.push(SITUATION_ENTRIES.lowMessages);
  if (state.interest < DISTRUSTFUL_BELOW) urgent.push(SITUATION_ENTRIES.distrustful);

  const rotating: CatalogEntry[] = [];
  if (state.focusStage) rotating.push(STAGE_ENTRIES[state.focusStage]);
  for (const key of REVEAL_ORDER) {
    if (state.pendingRevealables.includes(key)) rotating.push(REVEALABLE_ENTRIES[key]);
  }
  if (state.hiddenObjectionPending) rotating.push(SITUATION_ENTRIES.hidden);
  if (rotating.length === 0 || state.interest >= 70) rotating.push(SITUATION_ENTRIES.goal);
  return { urgent, rotating };
}

function rotate<T>(items: readonly T[], turn: number): T[] {
  if (items.length === 0) return [];
  const offset = Math.abs(turn) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function selectHint(state: HintState): Hint {
  const { urgent, rotating } = candidates(state);
  const entry = urgent[0] ?? rotate(rotating, state.sellerMessageCount)[0]!;
  return { id: entry.id, text: entry.hint };
}

/** 2–3 ideas: the focus stage first (if any), then urgent and rotating entries without repeats. */
export function selectIdeas(state: HintState): Idea[] {
  const { urgent, rotating } = candidates(state);
  const focus = state.focusStage ? STAGE_ENTRIES[state.focusStage] : null;
  const ordered = [
    ...(focus ? [focus] : []),
    ...urgent,
    ...rotate(
      rotating.filter((entry) => entry !== focus),
      state.sellerMessageCount,
    ),
    SITUATION_ENTRIES.goal,
    SITUATION_ENTRIES.hidden,
  ];
  const seen = new Set<string>();
  const ideas: Idea[] = [];
  for (const entry of ordered) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    ideas.push({ id: entry.id, text: entry.idea });
    if (ideas.length === 3) break;
  }
  return ideas;
}
