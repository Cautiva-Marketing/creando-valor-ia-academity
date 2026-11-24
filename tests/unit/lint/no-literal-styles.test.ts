import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

let eslint: ESLint;

async function restrictedSyntaxCount(name: string, filePath = 'src/components/fixture.tsx') {
  const [result] = await eslint.lintText(fixture(name), { filePath: `${root}${filePath}` });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax').length;
}

describe('design-token lint rule (research.md §R14)', { timeout: 60_000 }, () => {
  beforeAll(() => {
    eslint = new ESLint({ cwd: root });
  });

  it('accepts tokens, arbitrary variants and Tailwind v4 variable shorthand', async () => {
    expect(await restrictedSyntaxCount('valid.tsx')).toBe(0);
  });

  it('rejects hex color literals', async () => {
    expect(await restrictedSyntaxCount('invalid-hex.tsx')).toBe(1);
  });

  it('rejects color functions in strings and templates', async () => {
    expect(await restrictedSyntaxCount('invalid-color-fn.tsx')).toBe(2);
  });

  it('rejects arbitrary Tailwind values (sizes, widths, shadows)', async () => {
    expect(await restrictedSyntaxCount('invalid-arbitrary.tsx')).toBe(3);
  });

  it('rejects literal style values', async () => {
    expect(await restrictedSyntaxCount('invalid-style.tsx')).toBe(3);
  });

  it('does not apply inside src/styles/', async () => {
    expect(await restrictedSyntaxCount('invalid-hex.tsx', 'src/styles/fixture.tsx')).toBe(0);
  });
});
