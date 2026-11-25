/**
 * Spike (002 research.md §R4, T003). NOT imported from src/.
 *
 * Confirms that `streamText` + `Output.object` emits `reply` incrementally through
 * `partialOutputStream` with the candidate buyer model, and measures the time to the first visible
 * fragment (SC-007: < 2.5 s). Run with a real key and only fictitious data:
 *
 *   GOOGLE_GENERATIVE_AI_API_KEY=… AI_MODEL_BUYER=gemini-3.5-flash-lite pnpm tsx scripts/spikes/buyer-stream-spike.ts
 *
 * Record the result (model, first fragment p50/p95, incremental yes/no) in research.md §R4. If the
 * reply does not stream incrementally, adopt plan B (`\n§META§{json}`) before US4.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Output, streamText } from 'ai';
import { z } from 'zod';

const schema = z.object({
  reply: z.string().min(1).max(600),
  meta: z.object({
    interest_delta: z.number().int(),
    revealed: z.array(z.enum(['budget', 'timeline', 'decision_maker'])),
    hidden_objection_raised: z.enum(['h1', 'h2']).nullable(),
    seller_abusive: z.boolean(),
    end: z.boolean(),
    end_reason: z.enum(['goal_achieved', 'buyer_abandoned']).nullable(),
  }),
});

const SYSTEM = `Eres Rosa, compradora ficticia peruana interesada en un lote en Lurín. Responde breve,
en personaje, en español neutro-peruano. Devuelve primero "reply" y luego "meta".`;

async function runOnce(
  modelId: string,
): Promise<{ firstMs: number; totalMs: number; increments: number }> {
  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  const started = performance.now();
  const result = streamText({
    model: google(modelId),
    system: SYSTEM,
    messages: [
      { role: 'assistant', content: 'Hola, vi el anuncio del lote pero me parece caro.' },
      { role: 'user', content: '¿Qué es lo más importante para usted al elegir un lote?' },
    ],
    output: Output.object({ schema }),
    temperature: 0.8,
    maxRetries: 0,
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: process.env.SPIKE_THINKING ?? 'minimal' } },
    },
    onError: ({ error }) => {
      const e = error as { message?: string; statusCode?: number; responseBody?: string };
      console.error('STREAM ERROR', e.statusCode, e.message, e.responseBody?.slice(0, 400));
    },
  });
  let firstMs = -1;
  let lastReply = '';
  let increments = 0;
  for await (const partial of result.partialOutputStream) {
    const reply = typeof partial?.reply === 'string' ? partial.reply : '';
    if (reply.length > lastReply.length) {
      if (firstMs < 0) firstMs = performance.now() - started;
      increments += 1;
      lastReply = reply;
    }
  }
  await result.output;
  return { firstMs, totalMs: performance.now() - started, increments };
}

async function main() {
  const modelId = process.env.AI_MODEL_BUYER ?? 'gemini-3.5-flash-lite';
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('Set GOOGLE_GENERATIVE_AI_API_KEY (fictitious data only).');
    process.exit(2);
  }
  const runs = Number(process.env.SPIKE_RUNS ?? 10);
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const r = await runOnce(modelId);
    console.log(
      `run ${i + 1}: first=${Math.round(r.firstMs)}ms total=${Math.round(r.totalMs)}ms increments=${r.increments}`,
    );
    if (r.firstMs >= 0) samples.push(r.firstMs);
    // Free tier: requests per minute are per project; space the calls (SPIKE_DELAY_MS).
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.SPIKE_DELAY_MS ?? 7000)));
  }
  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
  console.log(
    `model=${modelId} p50=${Math.round(pct(0.5) ?? -1)}ms p95=${Math.round(pct(0.95) ?? -1)}ms`,
  );
}

void main();
