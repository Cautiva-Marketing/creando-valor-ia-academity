import { Skeleton } from '@/components/ui/skeleton';

/** Generic page skeleton for loading.tsx files. */
export function PageSkeleton({ rows = 4, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton className="h-5 w-full max-w-lg" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
