import type { CSSProperties } from 'react';

/**
 * Email palette and inline styles (contracts/emails.md → Reglas comunes). Email clients do not
 * support CSS variables, so the brand tokens are repeated here as literal values; this file lives
 * in src/styles/ (the only place literal colors are allowed). Contrast ≥ 4.5:1 in both modes.
 */
export const emailColors = {
  ink: '#0E5A4A',
  inkDark: '#7FD3BC',
  paper: '#F3F5F1',
  surface: '#FFFFFF',
  surfaceDark: '#0F1A17',
  text: '#1A2320',
  textDark: '#E6EEEA',
  muted: '#4A5852',
  mutedDark: '#A9B8B2',
  onInk: '#FFFFFF',
  border: '#D5DDD8',
} as const;

const fontStack =
  "Figtree, 'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const emailStyles = {
  body: {
    margin: 0,
    padding: '24px 0',
    backgroundColor: emailColors.paper,
    fontFamily: fontStack,
    color: emailColors.text,
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '32px 24px',
    backgroundColor: emailColors.surface,
    borderRadius: '12px',
    border: `1px solid ${emailColors.border}`,
  },
  brand: {
    margin: '0 0 24px',
    fontSize: '20px',
    fontWeight: 700,
    color: emailColors.ink,
    fontFamily: fontStack,
  },
  heading: { margin: '0 0 16px', fontSize: '22px', lineHeight: '30px', color: emailColors.text },
  text: { margin: '0 0 16px', fontSize: '16px', lineHeight: '24px', color: emailColors.text },
  small: { margin: '0 0 12px', fontSize: '13px', lineHeight: '20px', color: emailColors.muted },
  button: {
    display: 'inline-block',
    padding: '14px 24px',
    backgroundColor: emailColors.ink,
    color: emailColors.onInk,
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 700,
    textDecoration: 'none',
  },
  link: { color: emailColors.ink, textDecoration: 'underline', wordBreak: 'break-all' },
  buttonSection: { margin: '24px 0' },
  hr: { borderColor: emailColors.border, margin: '24px 0' },
  footer: { margin: '0 0 4px', fontSize: '12px', lineHeight: '18px', color: emailColors.muted },
} satisfies Record<string, CSSProperties>;

/** Dark-mode overrides for clients that honor prefers-color-scheme. */
export const emailDarkCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .cv-body { background-color: ${emailColors.surfaceDark} !important; color: ${emailColors.textDark} !important; }
    .cv-container { background-color: ${emailColors.surfaceDark} !important; border-color: ${emailColors.muted} !important; }
    .cv-text { color: ${emailColors.textDark} !important; }
    .cv-muted { color: ${emailColors.mutedDark} !important; }
    .cv-brand, .cv-link { color: ${emailColors.inkDark} !important; }
    .cv-button { background-color: ${emailColors.inkDark} !important; color: ${emailColors.surfaceDark} !important; }
  }
`;
