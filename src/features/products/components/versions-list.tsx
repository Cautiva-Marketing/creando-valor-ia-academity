import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatPENRange } from '@/lib/format';
import { SECTOR_LABELS } from '@/features/practice/domain/labels';
import type { ProductVersionContent } from '../queries';

/** Read-only history of immutable versions, newest first (FR-002, T051). */
export function VersionsList({
  versions,
  currentVersion,
  timezone,
}: {
  versions: ProductVersionContent[];
  currentVersion: number;
  timezone: string;
}) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Versiones del producto">
      {versions.map((v) => (
        <li key={v.version} className="rounded-lg border border-border bg-surface-raised p-4">
          <details>
            <summary className="flex min-h-touch cursor-pointer flex-wrap items-center gap-2">
              <span className="font-semibold">
                Versión {v.version} · {formatDateTime(v.createdAt, timezone)}
              </span>
              {v.version === currentVersion ? <Badge variant="primary">Vigente</Badge> : null}
            </summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <dt className="font-medium text-text-muted">Nombre</dt>
              <dd className="break-words sm:col-span-3">{v.name}</dd>
              <dt className="font-medium text-text-muted">Rubro</dt>
              <dd className="sm:col-span-3">{SECTOR_LABELS[v.sector]}</dd>
              <dt className="font-medium text-text-muted">Precio</dt>
              <dd className="tabular-nums sm:col-span-3">
                {formatPENRange(v.priceMin, v.priceMax)}
              </dd>
              {v.description ? (
                <>
                  <dt className="font-medium text-text-muted">Descripción</dt>
                  <dd className="break-words whitespace-pre-line sm:col-span-3">{v.description}</dd>
                </>
              ) : null}
              <dt className="font-medium text-text-muted">Beneficios</dt>
              <dd className="sm:col-span-3">
                <ul className="list-disc pl-5">
                  {v.benefits.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </dd>
              {v.differentiators.length ? (
                <>
                  <dt className="font-medium text-text-muted">Diferenciadores</dt>
                  <dd className="sm:col-span-3">
                    <ul className="list-disc pl-5">
                      {v.differentiators.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              ) : null}
              {v.verifiableFacts.length ? (
                <>
                  <dt className="font-medium text-text-muted">Datos verificables</dt>
                  <dd className="sm:col-span-3">
                    <ul className="list-disc pl-5">
                      {v.verifiableFacts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              ) : null}
            </dl>
          </details>
        </li>
      ))}
    </ol>
  );
}
