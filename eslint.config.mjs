import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Design-token guard (Constitution IV, research.md §R14).
 * Outside `src/styles/` components may not use literal colors, Tailwind arbitrary values
 * (`text-[13px]`, `w-[…]`, `shadow-[…]`) or literal `style` values (only `var(--…)` or CSS custom
 * properties). Arbitrary *variants* (`data-[state=open]:`, `aria-[…]:`, `group-[…]:`, `peer-[…]:`,
 * `has-[…]:`) and Tailwind v4 variable shorthand `*-(--…)` stay allowed.
 * Exceptions require an `eslint-disable-next-line` with a written justification.
 */
const COLOR_LITERAL = String.raw`/(^|[\s:(,'"=])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb|color-mix)\(/`;
const ARBITRARY_VALUE = String.raw`/(^|\s)[\w:!*&-]*[a-z0-9]-\[[^\]\s]+\](?!:)/`;

const literalStyleMessage =
  'Usa tokens del design system: sin colores, tamaños ni sombras literales fuera de src/styles/ (research.md §R14).';

export const designTokenRules = {
  'no-restricted-syntax': [
    'error',
    { selector: `Literal[value=${COLOR_LITERAL}]`, message: literalStyleMessage },
    { selector: `TemplateElement[value.raw=${COLOR_LITERAL}]`, message: literalStyleMessage },
    { selector: `Literal[value=${ARBITRARY_VALUE}]`, message: literalStyleMessage },
    { selector: `TemplateElement[value.raw=${ARBITRARY_VALUE}]`, message: literalStyleMessage },
    {
      selector: String.raw`JSXAttribute[name.name='style'] Property:not([key.value=/^--/]) > Literal:not([value=/^var\(--/])`,
      message: literalStyleMessage,
    },
    {
      selector: String.raw`JSXAttribute[name.name='style'] Property:not([key.value=/^--/]) > TemplateLiteral`,
      message: literalStyleMessage,
    },
  ],
};

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.lighthouseci/**',
      'next-env.d.ts',
      'supabase/**',
      'tests/unit/lint/fixtures/**',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx,mjs}'],
    ignores: ['src/styles/**'],
    rules: designTokenRules,
  },
  {
    files: ['scripts/**', 'tests/**'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
