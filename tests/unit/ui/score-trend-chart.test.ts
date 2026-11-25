import { describe, expect, it } from 'vitest';
import { trendGeometry, trendSummary } from '@/components/ui/score-trend-chart';

/** T171 — evolution chart geometry (axes 0–100) and its text summary (research.md §R13; FR-050). */
const points = [
  { label: '1 nov', score: 50 },
  { label: '5 nov', score: 100 },
  { label: '9 nov', score: 0 },
];

describe('trendGeometry', () => {
  const g = trendGeometry(points, { width: 300, height: 200, padding: 20 });

  it('spreads x evenly from the first to the last point inside the padding', () => {
    expect(g.points.map((p) => p.x)).toEqual([20, 150, 280]);
  });

  it('maps 0–100 onto the plot height (100 at the top)', () => {
    expect(g.points.map((p) => p.y)).toEqual([100, 20, 180]);
  });

  it('builds the line path and the 0/50/100 axis ticks', () => {
    expect(g.path).toBe('M 20 100 L 150 20 L 280 180');
    expect(g.ticks).toEqual([
      { value: 0, y: 180 },
      { value: 50, y: 100 },
      { value: 100, y: 20 },
    ]);
  });

  it('level bands (60, 75, 90) as y ranges', () => {
    expect(g.bands.map((b) => [b.level, b.y, b.height])).toEqual([
      ['reinforcement', 84, 96],
      ['developing', 60, 24],
      ['competent', 36, 24],
      ['advanced', 20, 16],
    ]);
  });

  it('clamps scores outside 0–100 and centers a single point', () => {
    const one = trendGeometry([{ label: 'x', score: 140 }], {
      width: 300,
      height: 200,
      padding: 20,
    });
    expect(one.points[0]).toMatchObject({ x: 150, y: 20 });
  });
});

describe('trendSummary', () => {
  it('describes count, first, last, best and trend', () => {
    expect(trendSummary(points)).toBe(
      '3 prácticas evaluadas. Primera: 50 (1 nov). Última: 0 (9 nov). Mejor: 100. Bajaste 50 puntos.',
    );
    expect(
      trendSummary([
        { label: 'a', score: 60 },
        { label: 'b', score: 72 },
      ]),
    ).toContain('Subiste 12 puntos.');
    expect(
      trendSummary([
        { label: 'a', score: 60 },
        { label: 'b', score: 60 },
      ]),
    ).toContain('Sin cambios.');
  });
});
