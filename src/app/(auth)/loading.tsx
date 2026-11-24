import { PageSkeleton } from '@/components/states/page-skeleton';

export default function Loading() {
  return <PageSkeleton rows={2} label="Cargando la página…" />;
}
