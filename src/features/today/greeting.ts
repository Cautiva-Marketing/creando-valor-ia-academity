/** Greeting by the local hour of the time zone (FR-051): 05–11 días, 12–18 tardes, else noches. */
export function greetingFor(at: Date, timeZone: string, firstName: string | null): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(at),
  );
  const greeting =
    hour >= 5 && hour < 12
      ? 'Buenos días'
      : hour >= 12 && hour < 19
        ? 'Buenas tardes'
        : 'Buenas noches';
  return firstName ? `${greeting}, ${firstName}` : greeting;
}
