/** Difficulty levels (FR-010). Initial interest mirrors `private.initial_interest`. */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface Difficulty {
  level: DifficultyLevel;
  name: string;
  initialInterest: number;
  description: string;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  {
    level: 1,
    name: 'Receptivo',
    initialInterest: 55,
    description:
      'Revela datos ante preguntas generales, tolera algún error y plantea su objeción oculta con poca indagación.',
  },
  {
    level: 2,
    name: 'Abierto',
    initialInterest: 50,
    description: 'Revela datos ante preguntas directas y reacciona moderadamente a la presión.',
  },
  {
    level: 3,
    name: 'Cauteloso',
    initialInterest: 45,
    description:
      'Revela datos solo ante preguntas específicas y pertinentes, y pide algún sustento.',
  },
  {
    level: 4,
    name: 'Exigente',
    initialInterest: 35,
    description:
      'Pide datos verificables y compara con la competencia; la presión y las promesas le bajan más el interés.',
  },
  {
    level: 5,
    name: 'Muy exigente',
    initialInterest: 25,
    description:
      'Responde breve, tiene poca paciencia y desconfía de entrada; solo se abre tras generar confianza.',
  },
];

export function difficultyFor(level: number): Difficulty {
  const found = DIFFICULTIES.find((d) => d.level === level);
  if (!found) throw new RangeError(`unknown difficulty ${level}`);
  return found;
}
