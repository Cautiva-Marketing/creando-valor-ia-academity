import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatLongDate } from '@/lib/format';
import type { LegalDocument } from '../queries';
import { Markdown } from '../render-markdown';

/** Current legal document with version, effective date and "Borrador" badge (FR-015, FR-047). */
export function LegalDocumentView({
  title,
  document,
}: {
  title: string;
  document: LegalDocument | null;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl sm:text-4xl">{title}</h1>
          {document ? (
            <p className="flex flex-wrap items-center gap-2 text-text-muted">
              <span>
                Versión {document.version} · vigente desde el {formatLongDate(document.effectiveAt)}
              </span>
              {document.isDraft ? <Badge variant="warning">Borrador</Badge> : null}
            </p>
          ) : null}
        </header>
        {document ? (
          // The page already has its h1: the document's own headings start at h2.
          <Markdown source={stripLeadingTitle(document.content)} headingOffset={1} />
        ) : (
          <EmptyState
            title="Documento no disponible"
            description="Vuelve a intentarlo más tarde."
          />
        )}
      </article>
    </div>
  );
}

/** Drops the document's own leading "# Title" (the page renders the title). */
function stripLeadingTitle(content: string): string {
  return content.replace(/^\s*#\s+[^\n]*\n/, '');
}
