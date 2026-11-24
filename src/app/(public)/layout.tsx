import Link from 'next/link';
import { SkipLink } from '@/components/app-shell/skip-link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

const FOOTER_LINKS = [
  { href: '/terminos', label: 'Términos de uso' },
  { href: '/privacidad', label: 'Política de privacidad' },
  { href: '/aviso-ia', label: 'Aviso de uso de IA' },
] as const;

/** Public pages: brand header with "Iniciar sesión" and a footer with the legal links. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="rounded-md" aria-label="Creando Valor IA™, ir al inicio">
            <Logo />
          </Link>
          <Button asChild variant="ghost">
            <Link href="/iniciar-sesion">Iniciar sesión</Link>
          </Button>
        </div>
      </header>
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Creando Valor IA™</p>
          <nav aria-label="Enlaces legales">
            <ul className="flex flex-wrap gap-x-4">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-touch items-center text-text underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
