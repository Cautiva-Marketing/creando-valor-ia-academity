import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Badge } from '@/components/ui/badge';
import { contrastRatio, parseThemeTokens } from '@/lib/contrast';
import { cn } from '@/lib/utils';
import { TOKEN_PAIRS } from '@/styles/token-pairs';

/** Tokens documented from the single source of truth (src/styles/tokens.css). */

const COLOR_TOKENS = [
  'primary',
  'on-primary',
  'accent',
  'on-accent',
  'accent-strong',
  'success',
  'on-success',
  'warning',
  'on-warning',
  'danger',
  'on-danger',
  'info',
  'on-info',
  'surface',
  'surface-raised',
  'surface-sunken',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'focus-ring',
  'highlight',
  'on-highlight',
  'avatar-1',
  'avatar-2',
  'avatar-3',
  'avatar-4',
  'avatar-5',
] as const;

const TYPE_SCALE = [
  ['text-4xl', 'Display 4xl'],
  ['text-3xl', 'Título 3xl'],
  ['text-2xl', 'Título 2xl'],
  ['text-xl', 'Subtítulo xl'],
  ['text-lg', 'Destacado lg'],
  ['text-base', 'Cuerpo base'],
  ['text-sm', 'Apoyo sm'],
  ['text-xs', 'Etiqueta xs'],
] as const;

const SPACING = [
  ['w-1', '1 · 4 px'],
  ['w-2', '2 · 8 px'],
  ['w-3', '3 · 12 px'],
  ['w-4', '4 · 16 px'],
  ['w-6', '6 · 24 px'],
  ['w-8', '8 · 32 px'],
  ['w-12', '12 · 48 px'],
] as const;

const RADII = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-full'] as const;
const ELEVATION = [
  ['shadow-sm', 'Elevación 1'],
  ['shadow-md', 'Elevación 2'],
  ['shadow-lg', 'Elevación 3'],
] as const;

async function loadTokens() {
  const css = await readFile(path.join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');
  return { themes: parseThemeTokens(css), css };
}

function motionValues(css: string) {
  const pick = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? '—';
  return [
    ['--duration-fast', pick('duration-fast')],
    ['--duration-normal', pick('duration-normal')],
    ['--duration-slow', pick('duration-slow')],
    ['--ease-standard', pick('ease-standard')],
    ['--ease-emphasized', pick('ease-emphasized')],
  ] as const;
}

function SubSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h3 id={id} className="text-xl">
        {title}
      </h3>
      {children}
    </section>
  );
}

export async function TokensSection() {
  const { themes, css } = await loadTokens();

  return (
    <section aria-labelledby="tokens" className="flex flex-col gap-10" data-testid="tokens-section">
      <h2 id="tokens" className="text-2xl">
        Tokens
      </h2>

      <SubSection id="tokens-color" title="Colores semánticos">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <li
              key={token}
              className="flex flex-col overflow-hidden rounded-lg border border-border"
            >
              <div className="grid h-12 grid-cols-2" aria-hidden="true">
                {/* --swatch resolves on the element, so .light/.dark pick each theme's value. */}
                <span
                  className="light bg-(--swatch)"
                  style={{ '--swatch': `var(--${token})` } as React.CSSProperties}
                />
                <span
                  className="dark bg-(--swatch)"
                  style={{ '--swatch': `var(--${token})` } as React.CSSProperties}
                />
              </div>
              <div className="flex flex-col gap-0.5 p-2 text-sm">
                <code className="font-semibold break-all">{token}</code>
                <span className="text-text-muted">
                  {themes.light[token] ?? '—'} · {themes.dark[token] ?? '—'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </SubSection>

      <SubSection id="tokens-contrast" title="Pares de contraste (WCAG 2.2 AA)">
        <ul
          className="flex flex-col divide-y divide-border rounded-lg border border-border"
          data-testid="contrast-pairs"
        >
          {TOKEN_PAIRS.map((pair) => {
            const ratios = (['light', 'dark'] as const).map((theme) => {
              const fg = themes[theme][pair.foreground];
              const bg = themes[theme][pair.background];
              return fg && bg ? contrastRatio(fg, bg) : 0;
            });
            return (
              <li
                key={`${pair.foreground}/${pair.background}`}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{pair.usage}</span>
                  <code className="text-sm break-all text-text-muted">
                    {pair.foreground} sobre {pair.background} · mínimo {pair.min}:1
                  </code>
                </div>
                <div className="flex gap-2">
                  {ratios.map((ratio, index) => (
                    <Badge
                      key={index}
                      variant={ratio >= pair.min ? 'success' : 'danger'}
                      data-contrast-ratio={ratio.toFixed(2)}
                    >
                      {index === 0 ? 'Claro' : 'Oscuro'} {ratio.toFixed(2)}:1
                    </Badge>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </SubSection>

      <SubSection id="tokens-type" title="Tipografía">
        <p className="text-text-muted">
          Títulos en{' '}
          <span className="font-display font-semibold text-text">Bricolage Grotesque</span>, cuerpo
          en <span className="font-semibold text-text">Figtree</span>. Escala fluida con clamp().
        </p>
        <ul className="flex flex-col gap-2">
          {TYPE_SCALE.map(([cls, label]) => (
            <li key={cls} className="flex flex-wrap items-baseline gap-x-4">
              <code className="w-24 shrink-0 text-sm text-text-muted">{cls}</code>
              <span className={cn(cls, cls.match(/[234]xl/) ? 'font-display' : '')}>{label}</span>
            </li>
          ))}
        </ul>
      </SubSection>

      <SubSection id="tokens-spacing" title="Espaciado (unidad de 4 px)">
        <ul className="flex flex-col gap-2">
          {SPACING.map(([cls, label]) => (
            <li key={cls} className="flex items-center gap-4">
              <code className="w-24 shrink-0 text-sm text-text-muted">{label}</code>
              <span className={cn('h-4 rounded-sm bg-primary', cls)} aria-hidden="true" />
            </li>
          ))}
        </ul>
      </SubSection>

      <SubSection id="tokens-radius" title="Radios">
        <ul className="flex flex-wrap gap-4">
          {RADII.map((cls) => (
            <li key={cls} className="flex flex-col items-center gap-2">
              <span
                className={cn('size-16 border-2 border-primary bg-surface-sunken', cls)}
                aria-hidden="true"
              />
              <code className="text-sm">{cls}</code>
            </li>
          ))}
        </ul>
      </SubSection>

      <SubSection id="tokens-elevation" title="Elevación">
        <ul className="flex flex-wrap gap-6">
          {ELEVATION.map(([cls, label]) => (
            <li
              key={cls}
              className={cn(
                'flex size-28 items-center justify-center rounded-lg bg-surface-raised text-center text-sm',
                cls,
              )}
            >
              {label}
              <br />
              <code>{cls}</code>
            </li>
          ))}
        </ul>
      </SubSection>

      <SubSection id="tokens-motion" title="Movimiento">
        <p className="text-text-muted">
          Con la preferencia de movimiento reducido, las duraciones pasan a 0 ms y los medidores se
          dibujan sin animación.
        </p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {motionValues(css).map(([name, value]) => (
            <div
              key={name}
              className="flex flex-wrap justify-between gap-2 rounded-md bg-surface-sunken p-3"
            >
              <dt>
                <code>{name}</code>
              </dt>
              <dd className="text-text-muted">
                <code className="break-all">{value}</code>
              </dd>
            </div>
          ))}
        </dl>
      </SubSection>
    </section>
  );
}
