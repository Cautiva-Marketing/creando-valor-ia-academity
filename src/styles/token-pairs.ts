/**
 * Declared foreground/background token pairs and their WCAG threshold (SC-009, FR-042).
 * 4.5 = text; 3 = UI components and large text / non-text indicators. Checked in both themes.
 */
export interface TokenPair {
  foreground: string;
  background: string;
  min: 4.5 | 3;
  usage: string;
}

const textSurfaces = ['surface', 'surface-raised', 'surface-sunken'] as const;

export const TOKEN_PAIRS: TokenPair[] = [
  ...textSurfaces.flatMap((bg) => [
    { foreground: 'text', background: bg, min: 4.5 as const, usage: 'Texto principal' },
    { foreground: 'text-muted', background: bg, min: 4.5 as const, usage: 'Texto secundario' },
    { foreground: 'primary', background: bg, min: 4.5 as const, usage: 'Enlaces y texto de marca' },
    {
      foreground: 'accent-strong',
      background: bg,
      min: 4.5 as const,
      usage: 'Texto e iconos de acento',
    },
    { foreground: 'danger', background: bg, min: 4.5 as const, usage: 'Mensajes de error' },
    { foreground: 'success', background: bg, min: 4.5 as const, usage: 'Mensajes de éxito' },
    { foreground: 'info', background: bg, min: 4.5 as const, usage: 'Mensajes informativos' },
    { foreground: 'border-strong', background: bg, min: 3 as const, usage: 'Bordes de controles' },
    { foreground: 'focus-ring', background: bg, min: 3 as const, usage: 'Anillo de foco' },
  ]),
  { foreground: 'on-primary', background: 'primary', min: 4.5, usage: 'Botón primario' },
  { foreground: 'on-accent', background: 'accent', min: 4.5, usage: 'Botón de acento' },
  { foreground: 'on-success', background: 'success', min: 4.5, usage: 'Insignia de éxito' },
  { foreground: 'on-warning', background: 'warning', min: 4.5, usage: 'Insignia de advertencia' },
  { foreground: 'on-danger', background: 'danger', min: 4.5, usage: 'Botón destructivo' },
  { foreground: 'on-info', background: 'info', min: 4.5, usage: 'Insignia informativa' },
  { foreground: 'primary', background: 'surface', min: 3, usage: 'Relleno de controles activos' },
  // `accent` (ají) is only a fill behind `on-accent` text (≈ 2.3:1 against light surfaces, research
  // §R14); indicators and accent text use `accent-strong` (checked above against every surface).
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    foreground: `on-avatar-${n}`,
    background: `avatar-${n}`,
    min: 4.5 as const,
    usage: `Avatar ${n}`,
  })),
];
