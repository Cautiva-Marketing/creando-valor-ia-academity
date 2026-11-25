import { generateText, streamText } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fakeModel,
  lastUserText,
  parseE2eMarkers,
  registerFakeScript,
  resetFakeProvider,
} from '@/lib/ai/fake';

/** T030 (research.md §R2): deterministic fake provider with `[[e2e:…]]` markers. */

afterEach(() => resetFakeProvider());

describe('parseE2eMarkers', () => {
  it('reads every marker with its optional argument', () => {
    expect(parseE2eMarkers('Hola [[e2e:revelar:budget]] y [[e2e:cerrar]] [[e2e:429:3]]')).toEqual([
      { name: 'revelar', arg: 'budget' },
      { name: 'cerrar', arg: null },
      { name: '429', arg: '3' },
    ]);
  });

  it('ignores malformed markers', () => {
    expect(parseE2eMarkers('[[e2e:]] [[otra:cosa]] texto')).toEqual([]);
  });
});

describe('fakeModel', () => {
  it('streams the registered script for its task, chunk by chunk', async () => {
    registerFakeScript('buyer', ({ userText }) => ({ text: `eco: ${userText}` }));
    const result = streamText({
      model: fakeModel('buyer'),
      messages: [{ role: 'user', content: 'hola' }],
      maxRetries: 0,
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) chunks.push(chunk);
    expect(chunks.join('')).toBe('eco: hola');
    expect(chunks.length).toBeGreaterThan(1);
    expect((await result.usage).outputTokens).toBeGreaterThan(0);
  });

  it('generates with the script of each task independently', async () => {
    registerFakeScript('evaluator', () => ({ text: '{"ok":true}' }));
    const { text } = await generateText({
      model: fakeModel('evaluator'),
      prompt: 'evalúa',
      maxRetries: 0,
    });
    expect(text).toBe('{"ok":true}');
  });

  it('answers with the built-in script when none is registered (buyer_setup persona)', async () => {
    const { text } = await generateText({
      model: fakeModel('buyer_setup'),
      prompt: 'x',
      maxRetries: 0,
    });
    expect(JSON.parse(text)).toMatchObject({ buyer: { name: 'Rosa Quispe' } });
  });

  it('[[e2e:429]] fails the first call of that message with a 429, then answers', async () => {
    registerFakeScript('buyer', () => ({ text: 'listo' }));
    const call = () =>
      generateText({
        model: fakeModel('buyer'),
        messages: [{ role: 'user', content: 'precio [[e2e:429]]' }],
        maxRetries: 0,
      });
    await expect(call()).rejects.toMatchObject({ statusCode: 429 });
    await expect(call()).resolves.toMatchObject({ text: 'listo' });
  });

  it('[[e2e:429:3]] fails the first three calls', async () => {
    registerFakeScript('buyer', () => ({ text: 'listo' }));
    const call = () =>
      generateText({ model: fakeModel('buyer'), prompt: 'a [[e2e:429:3]]', maxRetries: 0 }).then(
        () => 'ok',
        () => 'fail',
      );
    expect([await call(), await call(), await call(), await call()]).toEqual([
      'fail',
      'fail',
      'fail',
      'ok',
    ]);
  });

  it('[[e2e:cortar-stream]] emits part of the text and then errors', async () => {
    registerFakeScript('buyer', () => ({ text: 'una respuesta bastante larga para cortar' }));
    const result = streamText({
      model: fakeModel('buyer'),
      messages: [{ role: 'user', content: 'x [[e2e:cortar-stream]]' }],
      maxRetries: 0,
      onError: () => {},
    });
    const parts: string[] = [];
    let failed = false;
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') parts.push(part.text);
      if (part.type === 'error') failed = true;
    }
    expect(failed).toBe(true);
    expect(parts.join('').length).toBeGreaterThan(0);
    expect(parts.join('')).not.toBe('una respuesta bastante larga para cortar');
  });

  it('exposes the last user text and markers to scripts', async () => {
    let seen: unknown;
    registerFakeScript('buyer', (ctx) => {
      seen = { text: ctx.userText, markers: ctx.markers.map((m) => m.name), call: ctx.callIndex };
      return { text: 'ok' };
    });
    await generateText({
      model: fakeModel('buyer'),
      messages: [
        { role: 'user', content: 'primero' },
        { role: 'assistant', content: 'respuesta' },
        { role: 'user', content: 'segundo [[e2e:cerrar]]' },
      ],
      maxRetries: 0,
    });
    expect(seen).toEqual({ text: 'segundo [[e2e:cerrar]]', markers: ['cerrar'], call: 1 });
  });

  it('lastUserText reads text parts of the last user message', () => {
    expect(
      lastUserText([
        { role: 'system', content: 'sys' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b' },
          ],
        },
      ]),
    ).toBe('a\nb');
  });
});
