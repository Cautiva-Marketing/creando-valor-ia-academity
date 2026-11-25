'use client';

import { Chip } from '@/components/ui/chip';
import type { Database } from '@/lib/supabase/database.types';
import { suggestionsFor } from '../objection-suggestions';

type Category = Database['public']['Enums']['objection_category'];

/**
 * Suggestions grouped by category for the product's sector (FR-007, fixed catalog). Choosing one
 * copies text and category into the form so the seller adjusts it before saving.
 */
export function ObjectionSuggestions({
  sector,
  sectorLabel,
  onPick,
}: {
  sector: Database['public']['Enums']['product_sector'];
  sectorLabel: string;
  onPick: (text: string, category: Category) => void;
}) {
  return (
    <section aria-labelledby="sugerencias-titulo" className="flex flex-col gap-4">
      <div>
        <h3 id="sugerencias-titulo" className="text-base font-semibold">
          Sugerencias para {sectorLabel}
        </h3>
        <p className="text-sm text-text-muted">
          Elige una para copiarla al campo y ajústala a cómo te lo dicen tus clientes.
        </p>
      </div>
      {suggestionsFor(sector).map((group) => (
        <div
          key={group.category}
          role="group"
          aria-label={group.label}
          className="flex flex-col gap-2"
        >
          <h4 className="text-sm font-medium text-text-muted">{group.label}</h4>
          <div className="flex flex-wrap gap-2">
            {group.items.map((text) => (
              <Chip key={text} variant="soft" onClick={() => onPick(text, group.category)}>
                {text}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
