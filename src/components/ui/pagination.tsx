import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  pageCount: number;
  /** Builds the href of a page keeping the current filters. */
  hrefFor: (page: number) => string;
  label?: string;
}

const itemClass =
  'inline-flex min-h-touch min-w-touch items-center justify-center gap-1 rounded-md px-3 text-base';

/** Accessible pagination links (aria-current, 44 px targets). */
export function Pagination({ page, pageCount, hrefFor, label = 'Paginación' }: PaginationProps) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1,
  );

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={cn(itemClass, 'hover:bg-surface-sunken')}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </Link>
      ) : null}
      <ul className="flex flex-wrap items-center gap-1">
        {pages.map((p, index) => (
          <li key={p} className="flex items-center gap-1">
            {index > 0 && p - pages[index - 1]! > 1 ? (
              <span className="px-1 text-text-muted" aria-hidden="true">
                …
              </span>
            ) : null}
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Página ${p}`}
              className={cn(
                itemClass,
                p === page ? 'bg-primary font-semibold text-on-primary' : 'hover:bg-surface-sunken',
              )}
            >
              {p}
            </Link>
          </li>
        ))}
      </ul>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={cn(itemClass, 'hover:bg-surface-sunken')}>
          Siguiente
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
