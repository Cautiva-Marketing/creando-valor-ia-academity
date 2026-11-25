import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import {
  ProductFilters,
  ProductList,
  ProductsEmpty,
} from '@/features/products/components/product-list';
import { listProducts } from '@/features/products/queries';
import { productListQuerySchema, type ProductListQuery } from '@/features/products/schemas';

export const metadata: Metadata = { title: 'Mis productos' };

function hrefFor(query: ProductListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.estado === 'archivados') params.set('estado', query.estado);
  if (query.q) params.set('q', query.q);
  if (page > 1) params.set('pagina', String(page));
  return params.size ? `/productos?${params}` : '/productos';
}

/** Mis productos (H1, FR-004): active/archived filter, search by name, 20 per page. */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = productListQuerySchema.parse({
    estado: typeof params.estado === 'string' ? params.estado : undefined,
    q: typeof params.q === 'string' ? params.q : undefined,
    pagina: typeof params.pagina === 'string' ? params.pagina : undefined,
  });
  const { rows, total, pageCount, hasAnyProduct } = await listProducts(query);
  const archived = query.estado === 'archivados';
  const firstRun = !hasAnyProduct;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Mis productos</h1>
          <p className="text-text-muted">
            {total === 1 ? '1 producto' : `${total} productos`}
            {archived ? ' archivados' : ' activos'}
            {query.q ? ` que coinciden con “${query.q}”` : ''}
          </p>
        </div>
        {firstRun ? null : (
          <Button asChild>
            <Link href="/productos/nuevo">
              <Plus aria-hidden="true" />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      {firstRun ? null : <ProductFilters query={query} />}

      {rows.length === 0 ? (
        <ProductsEmpty firstRun={firstRun} filtered={Boolean(query.q)} archived={archived} />
      ) : (
        <ProductList rows={rows} />
      )}

      <Pagination
        page={query.pagina}
        pageCount={pageCount}
        hrefFor={(page) => hrefFor(query, page)}
        label="Páginas de productos"
      />
    </div>
  );
}
