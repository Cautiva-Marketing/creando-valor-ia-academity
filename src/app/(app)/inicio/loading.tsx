import { PageSkeleton } from '@/components/states/page-skeleton';

export default function Loading() {
  return <PageSkeleton rows={4} label="Preparando tu día…" />;
}
