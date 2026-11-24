import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, fieldControlClass } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { INVITATION_STATUSES, type InvitationListFilters } from '../schemas';
import { INVITATION_STATUS_LABELS } from './status';

/** GET form: works without JavaScript and keeps the filters in the URL. */
export function InvitationFilters({ filters }: { filters: InvitationListFilters }) {
  return (
    <form role="search" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="estado">Estado</Label>
        <select
          id="estado"
          name="estado"
          defaultValue={filters.status ?? ''}
          className={cn(fieldControlClass, 'min-h-touch py-2 sm:w-44')}
        >
          <option value="">Todos</option>
          {INVITATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INVITATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="q">Buscar por correo</Label>
        <Input id="q" name="q" type="search" defaultValue={filters.q ?? ''} autoComplete="off" />
      </div>
      <Button type="submit" variant="secondary">
        <Search aria-hidden="true" />
        Filtrar
      </Button>
    </form>
  );
}
