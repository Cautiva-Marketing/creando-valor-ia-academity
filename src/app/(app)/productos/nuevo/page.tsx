import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ProductForm } from '@/features/products/components/product-form';
import { requireSeller } from '@/lib/auth/seller';

export const metadata: Metadata = { title: 'Nuevo producto' };

/** New product (H1, FR-001/FR-005): on save → /productos/[id] with a toast. */
export default async function NewProductPage() {
  await requireSeller('/productos/nuevo');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/productos"
          className="inline-flex min-h-touch w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mis productos
        </Link>
        <h1 className="text-3xl">Nuevo producto</h1>
        <p className="text-text-muted">
          Tu cliente simulado conocerá estos datos y el evaluador los usará para revisar que lo que
          ofreces sea correcto.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ProductForm mode={{ kind: 'create' }} />
        </CardContent>
      </Card>
    </div>
  );
}
