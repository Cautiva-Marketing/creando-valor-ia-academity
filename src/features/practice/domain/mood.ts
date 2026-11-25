/** Mood bands (FR-026). Mirror of `private.mood` in SQL; keep both in sync. */
export type Mood = 'distrustful' | 'doubtful' | 'interested' | 'ready';

export const MOOD_LABELS: Record<Mood, string> = {
  distrustful: 'Desconfiado',
  doubtful: 'Dudando',
  interested: 'Interesado',
  ready: 'Listo para avanzar',
};

export function moodFor(interest: number): Mood {
  if (interest < 30) return 'distrustful';
  if (interest < 55) return 'doubtful';
  if (interest < 80) return 'interested';
  return 'ready';
}
