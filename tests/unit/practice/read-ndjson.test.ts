import { describe, expect, it } from 'vitest';
import { NdjsonParseError, readNdjson } from '@/features/practice/stream/read-ndjson';

/** T096 — NDJSON reader (contracts/route-handlers.md → "Lector en el navegador"). */

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function collect(chunks: Array<string | Uint8Array>) {
  const out: unknown[] = [];
  for await (const item of readNdjson(streamOf(chunks))) out.push(item);
  return out;
}

describe('readNdjson', () => {
  it('joins lines split across chunks', async () => {
    expect(await collect(['{"type":"del', 'ta","text":"Ho', 'la"}\n'])).toEqual([
      { type: 'delta', text: 'Hola' },
    ]);
  });

  it('yields several lines of one chunk in order and skips blank lines', async () => {
    expect(await collect(['{"a":1}\n{"a":2}\n\n{"a":3}\n'])).toEqual([
      { a: 1 },
      { a: 2 },
      { a: 3 },
    ]);
  });

  it('reads a last line without a trailing newline', async () => {
    expect(await collect(['{"a":1}\n{"a"', ':2}'])).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('keeps multibyte characters split between chunks', async () => {
    const bytes = new TextEncoder().encode('{"text":"¿qué tal?"}\n');
    expect(await collect([bytes.slice(0, 10), bytes.slice(10)])).toEqual([{ text: '¿qué tal?' }]);
  });

  it('invalid JSON → error', async () => {
    await expect(collect(['{"a":1}\nnot json\n'])).rejects.toBeInstanceOf(NdjsonParseError);
  });
});
