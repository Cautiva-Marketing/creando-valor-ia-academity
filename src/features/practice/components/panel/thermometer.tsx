import { Gauge } from '@/components/ui/gauge';
import { cn } from '@/lib/utils';
import { MOOD_LABELS, type Mood } from '../../domain/mood';

/** "+8", "−5" or "±0" (typographic minus). */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '±0';
}

/**
 * Interest thermometer (T119; FR-026) on the 001 gauge: value 0–100, mood band and the last change.
 * The gauge arc honors prefers-reduced-motion (MeterArc). Changes are announced by PanelAnnouncer.
 */
export function Thermometer({
  interest,
  mood,
  lastDelta,
  className,
}: {
  interest: number;
  mood: Mood;
  lastDelta: number | null;
  className?: string;
}) {
  const moodLabel = MOOD_LABELS[mood];
  return (
    <div className={cn('flex flex-col items-center gap-1', className)} data-testid="thermometer">
      <Gauge
        value={interest}
        label="Interés del cliente"
        valueText={`${interest} de 100, ${moodLabel}`}
      />
      <p className="flex items-center gap-2 font-semibold" data-testid="thermometer-mood">
        {moodLabel}
        {lastDelta != null && lastDelta !== 0 ? (
          <span className="text-sm text-text-muted" data-testid="thermometer-delta">
            {formatDelta(lastDelta)}
          </span>
        ) : null}
      </p>
    </div>
  );
}
