import { Button } from '@/components/ui/button';
import { Input, fieldControlClass } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { USAGE_PERIODS, USAGE_PERIOD_LABELS, type UsagePeriod } from '../periods';

/** GET form (works without JavaScript); the range dates apply when "Rango" is selected. */
export function PeriodSelector({
  period,
  from,
  to,
  errors,
}: {
  period: UsagePeriod;
  from?: string;
  to?: string;
  errors?: string[];
}) {
  return (
    <form
      method="get"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      aria-label="Periodo de consumo"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="periodo">Periodo</Label>
        <select
          id="periodo"
          name="periodo"
          defaultValue={period}
          className={cn(fieldControlClass, 'min-h-touch py-2 sm:w-44')}
        >
          {USAGE_PERIODS.map((value) => (
            <option key={value} value={value}>
              {USAGE_PERIOD_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="desde">Desde (rango)</Label>
        <Input
          id="desde"
          name="desde"
          type="date"
          defaultValue={from}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? 'periodo-error' : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hasta">Hasta (rango)</Label>
        <Input
          id="hasta"
          name="hasta"
          type="date"
          defaultValue={to}
          aria-invalid={errors?.length ? true : undefined}
        />
      </div>
      <Button type="submit" variant="secondary">
        Ver consumo
      </Button>
      {errors?.length ? (
        <p id="periodo-error" role="alert" className="w-full text-sm font-medium text-danger">
          {errors[0]}
        </p>
      ) : null}
    </form>
  );
}
