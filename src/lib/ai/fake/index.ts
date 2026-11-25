import 'server-only';
import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { AiTask } from '../config';
import { buyerScript } from './buyer';
import { buyerSetupScript } from './buyer-setup';
import { evaluatorScript } from './evaluator';

/**
 * Deterministic fake provider (research.md §R2) — TESTS ONLY (`AI_PROVIDER=fake`, rejected in
 * production by env.ts). Each task answers from a registered script (added by the practice feature:
 * persona, buyer turns, evaluation). Control markers in the last user message drive failure paths:
 *
 *   [[e2e:429]] / [[e2e:429:N]]  the first 1 / N calls with that exact message fail with HTTP 429
 *   [[e2e:cortar-stream]]        the first call with that message emits part of the text and then
 *                                errors (HTTP 503); a retry of the same message answers normally
 *
 * Semantic markers (`meta-invalida`, `revelar:<key>`, `cerrar`, `abandonar`, `eval-falla`,
 * `eval-lenta:N`) are
 * interpreted by the task scripts through `ctx.markers`.
 */
type CallOptions = Parameters<MockLanguageModelV3['doStream']>[0];
type StreamResult = Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer P> ? P : never;
type GenerateResult = Awaited<ReturnType<MockLanguageModelV3['doGenerate']>>;

export interface E2eMarker {
  name: string;
  arg: string | null;
}

export interface FakeScriptContext {
  task: AiTask;
  /** Text of the last user message (the seller message in buyer turns). */
  userText: string;
  /** Full prompt text (system + messages), for scripts that need the data blocks. */
  promptText: string;
  markers: E2eMarker[];
  /** 1-based count of calls with this same task and user text. */
  callIndex: number;
}

/** `delayMs` makes a non-streamed call take that long (e.g. to observe evaluation phases). */
export type FakeResponse = { text: string; delayMs?: number } | { status: number };
export type FakeScript = (ctx: FakeScriptContext) => FakeResponse;

const MARKER = /\[\[e2e:([a-z0-9-]+)(?::([a-z0-9_-]+))?\]\]/gi;

export function parseE2eMarkers(text: string): E2eMarker[] {
  return [...text.matchAll(MARKER)].map((m) => ({ name: m[1]!.toLowerCase(), arg: m[2] ?? null }));
}

interface LooseMessage {
  role: string;
  content: string | ReadonlyArray<{ type: string; text?: string }>;
}

function messageText(message: LooseMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

export function lastUserText(prompt: ReadonlyArray<LooseMessage>): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i]!.role === 'user') return messageText(prompt[i]!);
  }
  return '';
}

/** Built-in scripts per task; `registerFakeScript` overrides them (unit tests). */
const DEFAULT_SCRIPTS: Partial<Record<AiTask, FakeScript>> = {
  buyer_setup: buyerSetupScript,
  buyer: buyerScript,
  evaluator: evaluatorScript,
};

const scripts = new Map<AiTask, FakeScript>();
const callCounts = new Map<string, number>();

export function registerFakeScript(task: AiTask, script: FakeScript): void {
  scripts.set(task, script);
}

/** Clears registered scripts (back to the built-in ones) and call counters (unit tests). */
export function resetFakeProvider(): void {
  scripts.clear();
  callCounts.clear();
}

function chunkDelayMs(): number {
  const configured = Number(process.env.FAKE_AI_CHUNK_DELAY_MS);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return process.env.NODE_ENV === 'test' ? 0 : 15;
}

function fakeError(statusCode: number): APICallError {
  return new APICallError({
    message: `Fake provider error ${statusCode}`,
    url: 'fake://provider',
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

function usage(inputChars: number, outputChars: number) {
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  return {
    inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
  };
}

/** Word-sized chunks (with their trailing spaces), like a real model stream. */
function chunk(text: string): string[] {
  const out = text.match(/\S+\s*|\s+/g);
  return out && out.length > 0 ? out : [''];
}

function resolve(task: AiTask, options: CallOptions) {
  const prompt = options.prompt as unknown as LooseMessage[];
  const userText = lastUserText(prompt);
  const promptText = prompt.map(messageText).join('\n');
  const markers = parseE2eMarkers(userText);
  const key = `${task}\u0000${userText}`;
  const callIndex = (callCounts.get(key) ?? 0) + 1;
  callCounts.set(key, callIndex);

  const rateLimit = markers.find((m) => m.name === '429');
  if (rateLimit && callIndex <= Math.max(1, Number(rateLimit.arg ?? '1') || 1)) {
    throw fakeError(429);
  }
  const script = scripts.get(task) ?? DEFAULT_SCRIPTS[task];
  const response = script
    ? script({ task, userText, promptText, markers, callIndex })
    : { text: '{}' };
  if ('status' in response) throw fakeError(response.status);
  return {
    text: response.text,
    delayMs: response.delayMs ?? 0,
    promptText,
    cut: callIndex === 1 && markers.some((m) => m.name === 'cortar-stream'),
  };
}

export function fakeModel(task: AiTask): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: 'fake',
    modelId: `fake-${task}`,
    doGenerate: async (options): Promise<GenerateResult> => {
      const { text, promptText, delayMs } = resolve(task, options);
      if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usage(promptText.length, text.length),
        warnings: [],
      };
    },
    doStream: async (options): Promise<StreamResult> => {
      const { text, promptText, cut } = resolve(task, options);
      const pieces = chunk(text);
      const parts: StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
      ];
      if (cut) {
        const kept = pieces.slice(0, Math.max(1, Math.floor(pieces.length / 2)));
        for (const delta of kept) parts.push({ type: 'text-delta', id: 't', delta });
        parts.push({ type: 'error', error: fakeError(503) });
      } else {
        for (const delta of pieces) parts.push({ type: 'text-delta', id: 't', delta });
        parts.push({ type: 'text-end', id: 't' });
        parts.push({
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: usage(promptText.length, text.length),
        });
      }
      const delay = chunkDelayMs();
      return {
        stream: simulateReadableStream({
          chunks: parts,
          initialDelayInMs: delay,
          chunkDelayInMs: delay,
        }),
      };
    },
  });
}
