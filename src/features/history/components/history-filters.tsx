'use client';

import { Filter, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, fieldControlClass } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { difficultyFor, type DifficultyLevel } from '../../practice/domain/difficulty';
import { historyQueryString, parseHistoryFilters, type HistoryFilters } from '../schemas';

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

/**
 * History filters (T178; FR-049): a GET form that works without JavaScript; with JavaScript it
 * navigates to a clean URL (only the active filters, back to page 1), so the URL can be shared.
 */
export function HistoryFilters({
  filters,
  products,
}: {
  filters: HistoryFilters;
  products: ReadonlyArray<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const active = Boolean(filters.product || filters.difficulty || filters.from || filters.to);
  return (
    <form
      role="search"
      aria-label="Filtrar historial"
      method="get"
      action="/historial"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const raw = Object.fromEntries(
          [...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']),
        );
        const query = historyQueryString({ ...parseHistoryFilters(raw), page: 1 });
        router.push(query ? `/historial?${query}` : '/historial');
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-producto">Producto</Label>
        <select
          id="filtro-producto"
          name="producto"
          defaultValue={filters.product ?? ''}
          className={cn(fieldControlClass, 'min-h-touch py-2')}
        >
          <option value="">Todos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-dificultad">Dificultad</Label>
        <select
          id="filtro-dificultad"
          name="dificultad"
          defaultValue={filters.difficulty ?? ''}
          className={cn(fieldControlClass, 'min-h-touch py-2')}
        >
          <option value="">Todas</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d} · {difficultyFor(d as DifficultyLevel).name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-desde">Desde</Label>
        <Input id="filtro-desde" name="desde" type="date" defaultValue={filters.from ?? ''} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-hasta">Hasta</Label>
        <Input id="filtro-hasta" name="hasta" type="date" defaultValue={filters.to ?? ''} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary">
          <Filter aria-hidden="true" />
          Filtrar
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href="/historial">
              <X aria-hidden="true" />
              Limpiar
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
