'use client';

import { motion } from 'motion/react';
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * Reduced-motion preference that is correct after hydration (the server snapshot is `false`, then
 * React re-renders with the real value), unlike a one-shot read during the first render.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/**
 * Shared SVG arc for Gauge and ScoreRing. Animates the stroke from 0 to the value; with reduced motion
 * (FR-045) the arc is drawn statically at its final value, without Motion.
 */
export function MeterArc({
  d,
  fraction,
  strokeWidth,
  trackClass = 'stroke-surface-sunken',
  valueClass = 'stroke-primary',
}: {
  d: string;
  fraction: number;
  strokeWidth: number;
  trackClass?: string;
  valueClass?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const clamped = Math.min(1, Math.max(0, fraction));
  const common = {
    d,
    fill: 'none',
    strokeWidth,
    strokeLinecap: 'round' as const,
    className: valueClass,
  };
  return (
    <>
      <path
        d={d}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={trackClass}
      />
      {reduce ? (
        <path
          {...common}
          pathLength={1}
          strokeDasharray={`${clamped} 1`}
          data-reduced-motion="true"
        />
      ) : (
        <motion.path
          {...common}
          data-reduced-motion="false"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: clamped }}
          transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }}
        />
      )}
    </>
  );
}
