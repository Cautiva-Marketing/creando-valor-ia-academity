import { PackagePlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/form-alert';
import { OngoingPracticeCard } from '@/features/practice/components/ongoing-practice-card';
import { blockedReason, QuotaBlocked } from '@/features/practice/components/quota-blocked';
import { QuotaSummary } from '@/features/practice/components/quota-summary';
import { SetupForm } from '@/features/practice/components/setup-form';
import { getCurrentPractice, getQuotaStatus, getSetupOptions } from '@/features/practice/queries';
import { practicarQuerySchema } from '@/features/practice/schemas';
import { requireSeller } from '@/lib/auth/seller';

export const metadata: Metadata = { title: 'Practicar' };

const first = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/**
 * Practicar (US3, contracts/routes.md): an active practice → "Retomar" only; quota or setup caps
 * exhausted → reason + disabled form; no products/objections → links to create them.
 */
export default async function PracticarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx } = await requireSeller('/practicar');
  const params = await searchParams;
  const query = practicarQuerySchema.parse({
    producto: first(params.producto),
    foco: first(params.foco),
    aviso: first(params.aviso),
  });
  const [current, quota, products] = await Promise.all([
    getCurrentPractice(),
    getQuotaStatus(),
    getSetupOptions(),
  ]);

  const header = (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl">Practicar</h1>
      <p className="text-text-muted">
        Configura un cliente simulado a partir de tu producto y practica una conversación de venta.
      </p>
      <QuotaSummary quota={quota} />
    </div>
  );

  if (current?.status === 'active') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <OngoingPracticeCard practice={current} timezone={ctx.timezone} />
      </div>
    );
  }

  const blocked = blockedReason(quota, ctx.timezone) !== null;
  const hasObjections = products.some((p) => p.objections.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {header}
      {query.aviso === 'configuracion-cambiada' ? (
        <FormAlert tone="info" title="La configuración cambió">
          El producto o alguna de las objeciones de esa práctica ya no está disponible. Revisa la
          configuración y vuelve a prepararla.
        </FormAlert>
      ) : null}
      {current ? <OngoingPracticeCard practice={current} timezone={ctx.timezone} /> : null}
      <QuotaBlocked quota={quota} timezone={ctx.timezone} />

      {products.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="Primero registra un producto"
          description="Tu cliente simulado se arma a partir de tu producto y de sus objeciones frecuentes."
          action={
            <Link href="/productos/nuevo" className={buttonVariants({ variant: 'primary' })}>
              Registrar un producto
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            {!hasObjections ? (
              <FormAlert tone="info" className="mb-6">
                Ninguno de tus productos tiene objeciones todavía. Agrega al menos una para
                practicar.
              </FormAlert>
            ) : null}
            <SetupForm
              products={products}
              defaultProductId={query.producto}
              defaultFocus={query.foco}
              hasConfigured={current?.status === 'configured'}
              disabled={blocked}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
