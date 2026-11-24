/** WCAG 2.x relative luminance and contrast ratio for hex sRGB colors (SC-009, FR-042). */
export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3 || value.length === 4
      ? value
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Parses `--name: #hex;` declarations of the light (`:root, .light`) and `.dark` blocks. */
export function parseThemeTokens(css: string): {
  light: Record<string, string>;
  dark: Record<string, string>;
} {
  const block = (selector: RegExp) => {
    const match = selector.exec(css);
    const tokens: Record<string, string> = {};
    if (!match?.[1]) return tokens;
    for (const decl of match[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      tokens[decl[1]!] = decl[2]!;
    }
    return tokens;
  };
  return {
    light: block(/:root,\s*\.light\s*\{([^}]*)\}/),
    dark: block(/\.dark\s*\{([^}]*)\}/),
  };
}
