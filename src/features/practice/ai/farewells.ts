/**
 * Fixed in-character farewells (research.md §R4): appended when the buyer abandons (or it is the last
 * turn) and the model did not say goodbye after one regeneration with a server note.
 */
const ABANDON = [
  'Mira, la verdad no me convence. Lo dejo aquí, gracias por tu tiempo.',
  'Creo que esto no es para mí. Prefiero seguir buscando. Gracias.',
  'No me siento cómodo con esta conversación. Mejor lo dejamos aquí.',
] as const;

const LAST_TURN = [
  'Bueno, ya tengo que irme. Lo voy a pensar con calma. Gracias.',
  'Gracias por la información, lo evalúo y te aviso.',
] as const;

const GOODBYE_WORDS =
  /\b(adi[oó]s|chau|gracias|hasta luego|lo dejo|lo dejamos|me voy|tengo que irme|lo pensar[eé]|te aviso)\b/i;

export function saysGoodbye(text: string): boolean {
  return GOODBYE_WORDS.test(text);
}

export function farewellFor(kind: 'abandon' | 'last_turn', turn: number): string {
  const list = kind === 'abandon' ? ABANDON : LAST_TURN;
  return list[Math.abs(turn) % list.length]!;
}

/** Text + catalog farewell, within the 700 characters of a buyer message. */
export function withFarewell(text: string, kind: 'abandon' | 'last_turn', turn: number): string {
  const farewell = farewellFor(kind, turn);
  const base = text.trim().slice(0, 700 - farewell.length - 1);
  return base ? `${base} ${farewell}` : farewell;
}
