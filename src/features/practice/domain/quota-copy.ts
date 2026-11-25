import { formatDateTime } from '@/lib/format';

/**
 * Copy for exhausted quota (FR-017) and setup caps (FR-016) with date and time in the organization
 * time zone. Details come from `ActionFailure.details` (parsed from the SQL DETAIL).
 */
type Details = Record<string, string> | undefined;

/** "…el 25 nov. 2026, 12:00 a. m." — avoids a double period when the time ends in "m.". */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

export function quotaExhaustedMessage(details: Details, timeZone: string): string {
  const scope = details?.scope;
  if (scope === 'disabled') return 'Tu organización no tiene simulaciones habilitadas.';
  if ((scope === 'daily' || scope === 'monthly') && details?.renewsAt) {
    const which = scope === 'daily' ? 'diario' : 'mensual';
    return sentence(
      `Alcanzaste tu límite ${which} de simulaciones. Se renueva el ${formatDateTime(details.renewsAt, timeZone)}`,
    );
  }
  return 'Alcanzaste tu límite de simulaciones.';
}

export function setupLimitMessage(details: Details, timeZone: string): string {
  if (!details?.retryAt) return 'Alcanzaste el máximo de configuraciones de hoy.';
  const head =
    details.reason === 'failure'
      ? 'Alcanzaste el máximo de intentos fallidos de configuración de hoy.'
      : 'Alcanzaste el máximo de configuraciones de hoy.';
  return sentence(
    `${head} Podrás volver a configurar desde el ${formatDateTime(details.retryAt, timeZone)}`,
  );
}
