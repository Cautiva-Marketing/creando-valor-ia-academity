import type { Metadata } from 'next';
import { ComponentsSection } from '@/features/design-system/components/components-section';
import { TokensSection } from '@/features/design-system/components/tokens-section';
import { requireSuperadmin } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Design system' };
export const dynamic = 'force-dynamic';

export default async function DesignPage() {
  await requireSuperadmin('/design');
  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">Design system</h1>
        <p className="max-w-prose text-text-muted">
          Tokens y componentes vivos de Creando Valor IA™ en tema claro y oscuro, con sus estados.
        </p>
      </header>
      <TokensSection />
      <ComponentsSection />
    </div>
  );
}
