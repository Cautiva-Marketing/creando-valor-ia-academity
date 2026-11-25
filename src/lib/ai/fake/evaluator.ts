import type { FakeResponse, FakeScriptContext } from './index';

/**
 * Fake evaluator script (T147; TESTS ONLY). Builds a valid evaluation from the <rubrica> and
 * <transcripcion> blocks of the prompt, citing real seller message ids. Markers in any message:
 *
 *   [[e2e:eval-falla]]     every attempt returns output that fails the schema
 *   [[e2e:eval-lenta:N]]   each call takes N seconds (to observe the progress phases)
 *
 * Seller messages with "garantizo" raise `unfounded_promise`; with "solo hoy" or "decídete",
 * `undue_pressure`.
 */
interface RubricBlock {
  version: string;
  criterios: Array<{ key: string; peso: number }>;
}

interface TranscriptEntry {
  id: string;
  autor: 'vendedor' | 'cliente';
  texto: string;
}

function block<T>(promptText: string, tag: string): T | null {
  const match = new RegExp(`<${tag}>\\n(.*)\\n</${tag}>`).exec(promptText);
  if (!match) return null;
  try {
    return JSON.parse(match[1]!) as T;
  } catch {
    return null;
  }
}

function evaluatorDelayMs(ctx: FakeScriptContext): number {
  const slow = ctx.markers.find((m) => m.name === 'eval-lenta');
  const seconds = Number(slow?.arg ?? '0');
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) * 1000 : 0;
}

export function evaluatorScript(ctx: FakeScriptContext): FakeResponse {
  const delayMs = evaluatorDelayMs(ctx);
  if (ctx.markers.some((m) => m.name === 'eval-falla')) {
    return { text: JSON.stringify({ rubric_version: '1.0', criteria: [] }), delayMs };
  }
  const rubric = block<RubricBlock>(ctx.promptText, 'rubrica');
  const transcript = block<TranscriptEntry[]>(ctx.promptText, 'transcripcion') ?? [];
  if (!rubric) return { text: '{}' };
  const seller = transcript.filter((m) => m.autor === 'vendedor');
  const ids = seller.map((m) => m.id);

  const flags: Array<{ type: string; explanation: string; message_ids: string[] }> = [];
  const promise = seller.filter((m) => /garantizo/i.test(m.texto)).map((m) => m.id);
  if (promise.length > 0) {
    flags.push({
      type: 'unfounded_promise',
      explanation: 'Prometiste un resultado que no está en los datos del producto.',
      message_ids: promise,
    });
  }
  const pressure = seller.filter((m) => /solo hoy|decídete/i.test(m.texto)).map((m) => m.id);
  if (pressure.length > 0) {
    flags.push({
      type: 'undue_pressure',
      explanation: 'Presionaste al cliente con urgencia.',
      message_ids: pressure,
    });
  }

  const output = {
    rubric_version: rubric.version,
    criteria: rubric.criterios.map((c, index) =>
      ids.length === 0
        ? {
            criterion_id: c.key,
            status: 'no_evaluable',
            score: null,
            max_score: c.peso,
            evidence_message_ids: [],
            justification: 'No hubo mensajes del vendedor para evaluar este criterio.',
            improvement: '',
            confidence: 0.5,
          }
        : {
            criterion_id: c.key,
            status: 'evaluated',
            score: Math.round(c.peso * 0.7),
            max_score: c.peso,
            evidence_message_ids: [ids[index % ids.length]!],
            justification: 'Lo trabajaste de forma aceptable en la conversación.',
            improvement: 'Profundiza con una pregunta abierta antes de proponer.',
            confidence: 0.8,
          },
    ),
    total_score: 70,
    strengths: ['Saludaste con cordialidad.', 'Respondiste la objeción visible.'],
    improvements: ['Indaga el plazo y el presupuesto antes de proponer.'],
    suggested_drill: {
      text: 'Practica tres preguntas abiertas para descubrir la necesidad.',
      stage: 'conoce',
    },
    ethical_flags: flags,
  };
  return { text: JSON.stringify(output), delayMs };
}
