import { ArrowLeft, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ObjectionsPanel } from '@/features/products/components/objections-panel';
import { ProductForm } from '@/features/products/components/product-form';
import { ProductStatusDialog } from '@/features/products/components/product-status-dialog';
import { SavedToast } from '@/features/products/components/saved-toast';
import { VersionsList } from '@/features/products/components/versions-list';
import { getProduct, listObjections } from '@/features/products/queries';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Producto' };

const TABS = ['datos', 'objeciones', 'versiones'] as const;
type Tab = (typeof TABS)[number];

const SAVED_MESSAGES = { creado: 'Guardamos tu producto (versión 1).' };

/**
 * Product detail (H1/H2, FR-002–FR-008): tabs Datos (edit → new version), Objeciones and
 * Versiones; archive/reactivate and "Practicar con este producto". Foreign ids → notFound().
 */
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [product, objections] = await Promise.all([getProduct(id), listObjections(id)]);
  const tab: Tab = TABS.includes(query.pestana as Tab) ? (query.pestana as Tab) : 'datos';
  const archived = product.status === 'archived';

  return (
    <div className="flex flex-col gap-6">
      <SavedToast messages={SAVED_MESSAGES} />
      <div className="flex flex-col gap-2">
        <Link
          href="/productos"
          className="inline-flex min-h-touch w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mis productos
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl break-words">{product.current.name}</h1>
          {archived ? <Badge>Archivado</Badge> : null}
        </div>
        <p className="text-text-muted" data-testid="current-version">
          Versión {product.current.version} ·{' '}
          {formatDateTime(product.current.createdAt, product.timezone)}
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          {archived ? null : (
            <Button asChild>
              <Link href={`/practicar?producto=${product.id}`}>
                <MessagesSquare aria-hidden="true" />
                Practicar con este producto
              </Link>
            </Button>
          )}
          <ProductStatusDialog
            productId={product.id}
            productName={product.current.name}
            status={product.status}
          />
        </div>
      </div>

      <Tabs defaultValue={tab} className="flex flex-col gap-4">
        <TabsList aria-label="Secciones del producto">
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="objeciones">Objeciones</TabsTrigger>
          <TabsTrigger value="versiones">Versiones</TabsTrigger>
        </TabsList>
        <TabsContent value="datos">
          <Card>
            <CardContent className="pt-6">
              <p className="mb-4 text-sm text-text-muted">
                Al guardar se crea una versión nueva; las prácticas anteriores conservan la versión
                que usaron.
              </p>
              <ProductForm
                key={product.current.version}
                mode={{
                  kind: 'edit',
                  productId: product.id,
                  expectedVersion: product.current.version,
                  initial: product.current,
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="objeciones">
          <Card>
            <CardContent className="pt-6">
              <ObjectionsPanel
                productId={product.id}
                sector={product.current.sector}
                objections={objections}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="versiones">
          <VersionsList
            versions={product.versions}
            currentVersion={product.current.version}
            timezone={product.timezone}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
