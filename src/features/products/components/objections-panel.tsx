'use client';

import { MessageSquareWarning } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Database } from '@/lib/supabase/database.types';
import { SECTOR_LABELS } from '@/features/practice/domain/labels';
import type { ObjectionRow } from '../queries';
import { OBJECTION_LIMITS } from '../schemas';
import { ObjectionCreateForm, type ObjectionDraft } from './objection-form';
import { ObjectionList } from './objection-list';
import { ObjectionSuggestions } from './objection-suggestions';

/**
 * Objeciones tab (T066, US2): counter n/20, create form fed by sector suggestions, list with inline
 * edit and deletion. With no objections the suggestions are shown open as the empty state.
 */
export function ObjectionsPanel({
  productId,
  sector,
  objections,
}: {
  productId: string;
  sector: Database['public']['Enums']['product_sector'];
  objections: ObjectionRow[];
}) {
  const [draft, setDraft] = useState<ObjectionDraft>({ text: '', category: '' });
  const [announcement, setAnnouncement] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const count = objections.length;
  const atLimit = count >= OBJECTION_LIMITS.perProduct;
  const sectorLabel = SECTOR_LABELS[sector];

  const pick = (text: string, category: string) => {
    setDraft({ text, category });
    setAnnouncement('Sugerencia copiada al campo Objeción. Ajústala y guárdala.');
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const suggestions = atLimit ? null : (
    <ObjectionSuggestions sector={sector} sectorLabel={sectorLabel} onPick={pick} />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">Objeciones frecuentes</h2>
        <p className="font-medium tabular-nums" data-testid="objection-counter">
          <span aria-hidden="true">
            {count}/{OBJECTION_LIMITS.perProduct}
          </span>
          <span className="sr-only">
            {count} de {OBJECTION_LIMITS.perProduct} objeciones
          </span>
        </p>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-6 text-center">
          <MessageSquareWarning className="size-8 text-accent-strong" aria-hidden="true" />
          <p className="font-semibold">Aún no registras objeciones para este producto</p>
          <p className="text-sm text-text-muted">
            Escribe las que más escuchas o parte de una sugerencia. Las usarás para configurar tus
            prácticas.
          </p>
        </div>
      ) : null}

      <ObjectionCreateForm
        productId={productId}
        draft={draft}
        onDraftChange={setDraft}
        textRef={textRef}
        atLimit={atLimit}
      />

      {count === 0 ? (
        suggestions
      ) : suggestions ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="min-h-touch cursor-pointer content-center font-medium">
            Ver sugerencias para {sectorLabel}
          </summary>
          <div className="pt-4">{suggestions}</div>
        </details>
      ) : null}

      {count > 0 ? <ObjectionList productId={productId} objections={objections} /> : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
