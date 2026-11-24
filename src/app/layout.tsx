import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
  adjustFontFallback: true,
});

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: 'Creando Valor IA™',
    template: '%s · Creando Valor IA™',
  },
  description:
    'Practica la venta antes de hacerla de verdad: entrenamiento comercial con compradores simulados por IA.',
  applicationName: 'Creando Valor IA™',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${figtree.variable} ${bricolage.variable}`}
    >
      <body>
        <Providers nonce={nonce}>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
