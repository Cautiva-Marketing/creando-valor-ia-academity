import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseThemeTokens } from '@/lib/contrast';
import { TOKEN_PAIRS } from '@/styles/token-pairs';

const css = readFileSync(
  fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)),
  'utf8',
);
const themes = parseThemeTokens(css);

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#0E5A4A', '#F3F5F1')).toBeGreaterThan(7);
  });
});

describe.each(['light', 'dark'] as const)('tokens in %s theme (SC-009)', (theme) => {
  const tokens = themes[theme];

  it('declares every token referenced by the pairs', () => {
    for (const pair of TOKEN_PAIRS) {
      expect(tokens[pair.foreground], `${theme}: --${pair.foreground}`).toBeDefined();
      expect(tokens[pair.background], `${theme}: --${pair.background}`).toBeDefined();
    }
  });

  it.each(TOKEN_PAIRS.map((p) => [`${p.foreground} on ${p.background}`, p] as const))(
    '%s meets its WCAG AA threshold',
    (_label, pair) => {
      const ratio = contrastRatio(tokens[pair.foreground]!, tokens[pair.background]!);
      expect(ratio, `${theme} ${pair.usage}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(pair.min);
    },
  );
});
