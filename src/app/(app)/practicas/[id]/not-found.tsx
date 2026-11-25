import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** Unknown or foreign practice ids (never discloses whether it exists). */
export default function PracticeNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="No encontramos esta práctica"
      description="Puede que el enlace esté incompleto o que la práctica no sea tuya."
      action={
        <Link href="/practicar" className={buttonVariants({ variant: 'primary' })}>
          Ir a Practicar
        </Link>
      }
    />
  );
}
