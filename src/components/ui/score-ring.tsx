import { cn } from '@/lib/utils';
import { MeterArc } from './meter-arc';

const sizes = { sm: 'size-16 text-base', md: 'size-24 text-2xl', lg: 'size-32 text-3xl' } as const;

/** Score ring (role="meter", 0–100 by default) with the score in the center. */
export function ScoreRing({
  value,
  max = 100,
  label,
  size = 'md',
  className,
}: {
  value: number;
  max?: number;
  label: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('relative inline-flex items-center justify-center', sizes[size], className)}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
        focusable="false"
      >
        <MeterArc
          d="M 50 8 A 42 42 0 1 1 49.99 8"
          fraction={max === 0 ? 0 : value / max}
          strokeWidth={9}
          valueClass="stroke-accent-strong"
        />
      </svg>
      <span className="font-display font-bold" aria-hidden="true">
        {Math.round(value)}
      </span>
    </div>
  );
}
