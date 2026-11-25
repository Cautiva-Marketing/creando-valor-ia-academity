import { greetingFor } from '../greeting';

/** "Buenos días, Ana" by the local hour of the seller's time zone (T186; FR-051). */
export function Greeting({ firstName, timezone }: { firstName: string | null; timezone: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl">{greetingFor(new Date(), timezone, firstName)}</h1>
      <p className="text-text-muted">Esto es lo que te toca hoy.</p>
    </div>
  );
}
