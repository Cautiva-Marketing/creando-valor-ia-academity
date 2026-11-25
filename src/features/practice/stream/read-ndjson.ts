/**
 * NDJSON reader for the browser (contracts/route-handlers.md → "Lector en el navegador"): decodes the
 * body with TextDecoderStream and yields one parsed object per line, tolerating lines split across
 * chunks, several lines per chunk and a last line without a trailing newline.
 */
export class NdjsonParseError extends Error {
  override readonly name = 'NdjsonParseError';
}

export async function* readNdjson<T = unknown>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T, void, void> {
  const decoder = new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>;
  const reader = body.pipeThrough(decoder).getReader();
  let buffer = '';
  const parse = (line: string): T => {
    try {
      return JSON.parse(line) as T;
    } catch {
      throw new NdjsonParseError('Invalid NDJSON line');
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield parse(line);
        newline = buffer.indexOf('\n');
      }
    }
    const last = buffer.trim();
    if (last) yield parse(last);
  } finally {
    reader.releaseLock();
  }
}
