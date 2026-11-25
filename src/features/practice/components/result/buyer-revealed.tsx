import { Badge } from '@/components/ui/badge';
import type { ResultViewModel } from '../../result/view-model';

/**
 * The full buyer persona, revealed after the practice (T165; FR-046): public profile, motivation,
 * personality, revealable data discovered or not, and hidden objections raised or not.
 */
export function BuyerRevealed({
  buyer,
  visibleObjection,
  vm,
}: {
  buyer: { name: string; age: number; occupation: string; intro: string; goal: string };
  visibleObjection: string;
  vm: Pick<ResultViewModel, 'revealables' | 'hiddenObjections' | 'motivation' | 'personality'>;
}) {
  return (
    <section
      aria-labelledby="buyer-revealed-title"
      data-testid="buyer-revealed"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="buyer-revealed-title" className="text-xl">
          Así era {buyer.name}
        </h2>
        <p className="text-text-muted">
          {buyer.age} años · {buyer.occupation}
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-text-muted">Quién es</dt>
          <dd>{buyer.intro}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">Qué buscaba</dt>
          <dd>{buyer.goal}</dd>
        </div>
        {vm.motivation ? (
          <div>
            <dt className="text-sm text-text-muted">Motivación</dt>
            <dd>{vm.motivation}</dd>
          </div>
        ) : null}
        {vm.personality ? (
          <div>
            <dt className="text-sm text-text-muted">Personalidad</dt>
            <dd>{vm.personality}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-text-muted">Objeción visible</dt>
          <dd>{visibleObjection}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg">Datos por descubrir</h3>
        <ul className="flex flex-col gap-2">
          {vm.revealables.map((r) => (
            <li
              key={r.key}
              data-testid="revealed-item"
              data-discovered={r.discovered}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="font-semibold">{r.label}:</span> {r.value}
              <Badge variant={r.discovered ? 'success' : 'neutral'}>
                {r.discovered ? 'Descubierto' : 'No descubierto'}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {vm.hiddenObjections.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg">Objeciones ocultas</h3>
          <ul className="flex flex-col gap-2">
            {vm.hiddenObjections.map((o) => (
              <li
                key={o.id}
                data-testid="hidden-objection"
                data-raised={o.raised}
                className="flex flex-wrap items-center gap-2"
              >
                {o.text}
                <Badge variant={o.raised ? 'info' : 'neutral'}>
                  {o.raised ? 'Apareció' : 'No apareció'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
