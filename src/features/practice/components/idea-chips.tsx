'use client';

import { Chip } from '@/components/ui/chip';
import type { Idea } from '../hints/select';

/**
 * "Ideas para probar" (T122; FR-031): 2–3 chips from the fixed catalog. Tapping one inserts its text
 * into the composer, editable, without sending it.
 */
export function IdeaChips({ ideas, onPick }: { ideas: Idea[]; onPick: (text: string) => void }) {
  if (ideas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p id="ideas-title" className="text-sm font-semibold text-text-muted">
        Ideas para probar
      </p>
      <ul aria-labelledby="ideas-title" className="flex flex-wrap gap-2" data-testid="idea-chips">
        {ideas.map((idea) => (
          <li key={idea.id}>
            <Chip variant="soft" onClick={() => onPick(idea.text)}>
              {idea.text}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}
