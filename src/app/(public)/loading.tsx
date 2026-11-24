import { PageSkeleton } from '@/components/states/page-skeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <PageSkeleton rows={3} label="Cargando la página…" />
    </div>
  );
}
