import type { Database } from '@/lib/supabase/database.types';

/** Cautiva method stages in canonical order (FR-037; same order as the SQL enum). */
export type CautivaStage = Database['public']['Enums']['cautiva_stage'];

export const CAUTIVA_STAGES = [
  'conoce',
  'aumenta',
  'une',
  'transforma',
  'innova',
  'vende',
  'asegura',
] as const satisfies readonly CautivaStage[];

const LABELS: Record<CautivaStage, string> = {
  conoce: 'Conoce',
  aumenta: 'Aumenta',
  une: 'Une',
  transforma: 'Transforma',
  innova: 'Innova',
  vende: 'Vende',
  asegura: 'Asegura',
};

export function cautivaLabel(stage: CautivaStage): string {
  return LABELS[stage];
}

export function isCautivaStage(value: unknown): value is CautivaStage {
  return typeof value === 'string' && (CAUTIVA_STAGES as readonly string[]).includes(value);
}
