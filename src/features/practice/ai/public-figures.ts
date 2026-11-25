/**
 * Heuristic list of well-known public figures (FR-013): a generated buyer must be fictitious, so a
 * persona whose name matches one of these is rejected and regenerated. Not exhaustive by design; the
 * prompt already forbids real people.
 */
const PUBLIC_FIGURES = [
  // Peru: politics
  'Alan García',
  'Alberto Fujimori',
  'Keiko Fujimori',
  'Pedro Castillo',
  'Dina Boluarte',
  'Martín Vizcarra',
  'Ollanta Humala',
  'Pedro Pablo Kuczynski',
  'Alejandro Toledo',
  'Fernando Belaúnde',
  'Manuel Merino',
  'Francisco Sagasti',
  'José Jerí',
  'Rafael López Aliaga',
  'Verónika Mendoza',
  'George Forsyth',
  'Hernando de Soto',
  // Peru: culture, sports, business, media
  'Mario Vargas Llosa',
  'César Vallejo',
  'Chabuca Granda',
  'Gastón Acurio',
  'Paolo Guerrero',
  'Jefferson Farfán',
  'Claudio Pizarro',
  'Teófilo Cubillas',
  'Gian Marco',
  'Eva Ayllón',
  'Susana Baca',
  'Yma Sumac',
  'Juan Diego Flórez',
  'Kina Malpartida',
  'Sofía Mulánovich',
  'Gisela Valcárcel',
  'Magaly Medina',
  'Carlos Alcántara',
  'Christian Meier',
  'Dionisio Romero',
  'Carlos Rodríguez-Pastor',
  'Natalia Málaga',
  'Ricardo Gareca',
  // International
  'Lionel Messi',
  'Cristiano Ronaldo',
  'Shakira',
  'Elon Musk',
  'Bill Gates',
  'Jeff Bezos',
  'Mark Zuckerberg',
  'Steve Jobs',
  'Donald Trump',
  'Joe Biden',
  'Barack Obama',
  'Papa Francisco',
  'León XIV',
  'Robert Prevost',
  'Gabriel García Márquez',
  'Taylor Swift',
  'Bad Bunny',
  'Lionel Andrés Messi',
] as const;

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED = PUBLIC_FIGURES.map(normalizeName);

/** True when the name equals a listed figure or contains one as whole words. */
export function isPublicFigureName(name: string): boolean {
  const normalized = ` ${normalizeName(name)} `;
  return NORMALIZED.some((figure) => normalized.includes(` ${figure} `));
}
