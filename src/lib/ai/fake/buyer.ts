import type { FakeResponse, FakeScriptContext } from './index';

/**
 * Fake buyer script (T109) — TESTS ONLY. Deterministic replies to the seller's last message, driven by
 * markers in that message (handled here; `429` and `cortar-stream` are handled by the provider):
 *
 *   [[e2e:meta-invalida]]     the first answer to this message has uninterpretable metadata
 *   [[e2e:revelar:<key>]]     reveals budget | timeline | decision_maker with its value
 *   [[e2e:oculta]]            raises the first hidden objection not raised yet
 *   [[e2e:cerrar]]            +15 and goal_achieved (the server only accepts it with interest ≥ 80)
 *   [[e2e:abandonar]]         −15 and a goodbye (the server decides whether it is an abandonment)
 *
 * Without markers: a short neutral reply with +3; on the last turn or with a server note, a goodbye.
 */
interface FichaBlock {
  revelables?: Array<{ clave?: string; valor?: string; ya_revelado?: boolean }>;
  objeciones_ocultas?: Array<{ id?: string; texto?: string; ya_planteada?: boolean }>;
}

interface EstadoBlock {
  mensajes_del_vendedor?: number;
  es_tu_ultimo_mensaje?: boolean;
  nota_del_servidor?: string;
}

function block<T>(promptText: string, tag: string): T {
  const match = new RegExp(`<${tag}>\\n(.*)\\n</${tag}>`).exec(promptText);
  if (!match) return {} as T;
  try {
    return JSON.parse(match[1]!) as T;
  } catch {
    return {} as T;
  }
}

const NEUTRAL = [
  'Entiendo. Cuéntame un poco más, por favor.',
  'Ya veo. ¿Y eso cómo me ayudaría a mí?',
  'Mmm, interesante. ¿Qué más me puedes decir?',
] as const;

export function buyerScript(ctx: FakeScriptContext): FakeResponse {
  const ficha = block<FichaBlock>(ctx.promptText, 'ficha');
  const estado = block<EstadoBlock>(ctx.promptText, 'estado');
  const has = (name: string) => ctx.markers.some((m) => m.name === name);
  const turn = estado.mensajes_del_vendedor ?? 1;

  if (has('meta-invalida') && ctx.callIndex === 1) {
    return {
      text: JSON.stringify({ reply: 'Hmm, déjame pensarlo.', meta: { interest_delta: 'x' } }),
    };
  }

  const meta = {
    interest_delta: 3,
    revealed: [] as string[],
    hidden_objection_raised: null as string | null,
    seller_abusive: false,
    end: false,
    end_reason: null as string | null,
  };
  const parts: string[] = [];

  for (const marker of ctx.markers.filter((m) => m.name === 'revelar' && m.arg)) {
    const item = ficha.revelables?.find((r) => r.clave === marker.arg);
    if (item?.valor) {
      meta.revealed.push(marker.arg!);
      parts.push(`Te cuento: ${item.valor}.`);
    }
  }
  if (has('oculta')) {
    const hidden = ficha.objeciones_ocultas?.find((h) => !h.ya_planteada);
    if (hidden?.id) {
      meta.hidden_objection_raised = hidden.id;
      parts.push(`La verdad, hay algo más: ${hidden.texto ?? ''}`.trim());
    }
  }

  if (has('cerrar')) {
    meta.interest_delta = 15;
    meta.end = true;
    meta.end_reason = 'goal_achieved';
    parts.push('¡Perfecto, me convenciste! Avancemos.');
  } else if (has('abandonar') || estado.nota_del_servidor) {
    meta.interest_delta = -15;
    meta.end = true;
    meta.end_reason = 'buyer_abandoned';
    parts.push('Mira, mejor lo dejo aquí. Gracias por tu tiempo.');
  } else if (estado.es_tu_ultimo_mensaje) {
    parts.push('Gracias por la información, lo voy a pensar y te aviso.');
  } else if (parts.length === 0) {
    parts.push(NEUTRAL[(turn - 1 + NEUTRAL.length) % NEUTRAL.length]!);
  }

  return { text: JSON.stringify({ reply: parts.join(' '), meta }) };
}
