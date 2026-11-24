import { cn } from '@/lib/utils';

/** Brand mark with tokens and an accessible name. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-display font-bold text-primary',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M9 20.5 14 11l4.5 7 2.5-3.5 2 5.5"
          fill="none"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-on-primary"
        />
        <circle cx="23" cy="10" r="2.5" className="fill-accent" />
      </svg>
      {compact ? (
        <span className="sr-only">Creando Valor IA™</span>
      ) : (
        <span className="text-lg leading-tight">Creando Valor IA™</span>
      )}
    </span>
  );
}
