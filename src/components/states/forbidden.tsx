import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** "Sin permiso": never reveals whether the resource exists (contracts/routes.md). */
export function Forbidden({ homeHref = '/inicio' }: { homeHref?: string }) {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
      data-testid="forbidden"
    >
      <ShieldOff className="size-12 text-accent-strong" aria-hidden="true" />
      <h1 className="text-2xl">No tienes permiso para ver esta página</h1>
      <p className="text-text-muted">
        Si crees que deberías tener acceso, contacta a la persona que administra tu cuenta.
      </p>
      <Button asChild variant="secondary">
        <Link href={homeHref}>Volver al inicio</Link>
      </Button>
    </div>
  );
}
