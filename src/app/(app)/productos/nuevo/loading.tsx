import { PageSkeleton } from '@/components/states/page-skeleton';

export default function Loading() {
  return <PageSkeleton rows={5} label="Cargando tus productos…" />;
}
