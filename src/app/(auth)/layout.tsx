import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

/** Centered brand layout for sign-in, recovery and account-state screens. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <Link href="/" className="mb-8 rounded-md" aria-label="Creando Valor IA™, ir al inicio">
        <Logo />
      </Link>
      <main id="contenido" className="w-full max-w-md">
        {children}
      </main>
    </div>
  );
}
