import { cn } from '@/lib/utils';
import { MeterArc } from './meter-arc';

/** Semicircular gauge (role="meter"). `label` is the accessible name; the value is also shown. */
export function Gauge({
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  valueText?: string;
  className?: string;
}) {
  const fraction = max === min ? 0 : (value - min) / (max - min);
  const text = valueText ?? `${Math.round(value)}`;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn('relative inline-flex w-40 flex-col items-center', className)}
    >
      <svg viewBox="0 0 120 68" className="w-full" aria-hidden="true" focusable="false">
        <MeterArc d="M 10 60 A 50 50 0 0 1 110 60" fraction={fraction} strokeWidth={10} />
      </svg>
      <span className="-mt-8 font-display text-2xl font-bold" aria-hidden="true">
        {text}
      </span>
    </div>
  );
}
