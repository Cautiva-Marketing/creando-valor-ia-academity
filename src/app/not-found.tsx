import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Página no encontrada' };

export default function NotFound() {
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <Logo />
      <p className="font-display text-4xl font-bold text-accent-strong">404</p>
      <h1 className="text-2xl">No encontramos esta página</h1>
      <p className="text-text-muted">
        Es posible que el enlace esté mal escrito o que la página ya no exista.
      </p>
      <Button asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
