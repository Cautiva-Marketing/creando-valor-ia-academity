'use client';

import { Table2, LineChart } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from './button';

/**
 * Evolution of the total score (T176; research.md §R13; FR-050): own SVG (line + points, 0–100 axis,
 * level bands with tokens) inside <figure>/<figcaption>, `role="img"` with a text summary, and a
 * "Ver como tabla" toggle that shows the same data as a <table>.
 */
export interface TrendPoint {
  /** Short date label (already formatted in the organization time zone). */
  label: string;
  score: number;
  /** Extra column of the table (e.g. product). */
  detail?: string;
}

type Level = 'reinforcement' | 'developing' | 'competent' | 'advanced';

const LEVEL_BANDS: ReadonlyArray<{ level: Level; from: number; to: number; className: string }> = [
  { level: 'reinforcement', from: 0, to: 60, className: 'fill-danger/10' },
  { level: 'developing', from: 60, to: 75, className: 'fill-warning/15' },
  { level: 'competent', from: 75, to: 90, className: 'fill-info/10' },
  { level: 'advanced', from: 90, to: 100, className: 'fill-success/15' },
];

const clamp = (score: number) => Math.min(100, Math.max(0, score));

export function trendGeometry(
  points: readonly TrendPoint[],
  { width, height, padding }: { width: number; height: number; padding: number },
) {
  const plotW = width - 2 * padding;
  const plotH = height - 2 * padding;
  const y = (score: number) => padding + plotH - (clamp(score) / 100) * plotH;
  const xs =
    points.length === 1
      ? [padding + plotW / 2]
      : points.map((_, i) => padding + (plotW * i) / (points.length - 1));
  const placed = points.map((p, i) => ({ ...p, x: xs[i]!, y: y(p.score) }));
  return {
    points: placed,
    path: placed.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
    ticks: [0, 50, 100].map((value) => ({ value, y: y(value) })),
    bands: LEVEL_BANDS.map((b) => ({
      level: b.level,
      className: b.className,
      y: y(b.to),
      height: y(b.from) - y(b.to),
    })),
  };
}

export function trendSummary(points: readonly TrendPoint[]): string {
  if (points.length === 0) return 'Sin prácticas evaluadas.';
  const firstPoint = points[0]!;
  const last = points[points.length - 1]!;
  const best = Math.max(...points.map((p) => p.score));
  const delta = last.score - firstPoint.score;
  const trend =
    delta > 0
      ? `Subiste ${delta} ${delta === 1 ? 'punto' : 'puntos'}.`
      : delta < 0
        ? `Bajaste ${-delta} ${delta === -1 ? 'punto' : 'puntos'}.`
        : 'Sin cambios.';
  const count =
    points.length === 1 ? '1 práctica evaluada' : `${points.length} prácticas evaluadas`;
  return `${count}. Primera: ${firstPoint.score} (${firstPoint.label}). Última: ${last.score} (${last.label}). Mejor: ${best}. ${trend}`;
}

const SIZE = { width: 640, height: 240, padding: 28 };

export function ScoreTrendChart({
  points,
  title = 'Evolución de tu puntaje',
  detailHeader = 'Producto',
}: {
  points: readonly TrendPoint[];
  title?: string;
  detailHeader?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const captionId = useId();
  const geometry = trendGeometry(points, SIZE);
  const summary = trendSummary(points);
  return (
    <figure
      aria-labelledby={captionId}
      data-testid="score-trend-chart"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption id={captionId} className="text-xl font-semibold">
          {title}
        </figcaption>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={asTable}
          onClick={() => setAsTable((value) => !value)}
        >
          {asTable ? <LineChart aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          {asTable ? 'Ver como gráfico' : 'Ver como tabla'}
        </Button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="score-trend-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-4">
                  Fecha
                </th>
                {points.some((p) => p.detail) ? (
                  <th scope="col" className="py-2 pr-4">
                    {detailHeader}
                  </th>
                ) : null}
                <th scope="col" className="py-2">
                  Puntaje
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={`${p.label}-${i}`} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">{p.label}</td>
                  {points.some((q) => q.detail) ? <td className="py-2 pr-4">{p.detail}</td> : null}
                  <td className="py-2">{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          role="img"
          aria-label={summary}
          viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
          className="h-auto w-full"
          data-testid="score-trend-svg"
        >
          {geometry.bands.map((b) => (
            <rect
              key={b.level}
              x={SIZE.padding}
              y={b.y}
              width={SIZE.width - 2 * SIZE.padding}
              height={b.height}
              className={b.className}
            />
          ))}
          {geometry.ticks.map((t) => (
            <g key={t.value}>
              <line
                x1={SIZE.padding}
                x2={SIZE.width - SIZE.padding}
                y1={t.y}
                y2={t.y}
                className="stroke-border"
                strokeDasharray="4 4"
              />
              <text
                x={SIZE.padding - 6}
                y={t.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text-muted text-xs"
              >
                {t.value}
              </text>
            </g>
          ))}
          <path
            d={geometry.path}
            fill="none"
            strokeWidth={3}
            strokeLinejoin="round"
            className="stroke-primary"
          />
          {geometry.points.map((p, i) => (
            <circle
              key={`${p.label}-${i}`}
              cx={p.x}
              cy={p.y}
              r={5}
              strokeWidth={2}
              className="fill-surface-raised stroke-primary"
            />
          ))}
        </svg>
      )}
      <p className="text-sm text-text-muted">{summary}</p>
    </figure>
  );
}
