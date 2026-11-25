import { describe, expect, it } from 'vitest';
import { quotaExhaustedMessage, setupLimitMessage } from '@/features/practice/domain/quota-copy';

/** T034 (FR-016, FR-017): copy with date and time in the organization time zone. */

const LIMA = 'America/Lima';

describe('quotaExhaustedMessage', () => {
  it('daily: renews at the start of the next local day', () => {
    expect(quotaExhaustedMessage({ scope: 'daily', renewsAt: '2026-11-25T05:00:00Z' }, LIMA)).toBe(
      'Alcanzaste tu límite diario de simulaciones. Se renueva el 25 nov. 2026, 12:00 a. m.',
    );
  });

  it('monthly: renews at the start of the next local month', () => {
    expect(
      quotaExhaustedMessage({ scope: 'monthly', renewsAt: '2026-12-01T05:00:00Z' }, LIMA),
    ).toBe('Alcanzaste tu límite mensual de simulaciones. Se renueva el 1 dic. 2026, 12:00 a. m.');
  });

  it('uses the organization time zone, not the server one', () => {
    expect(
      quotaExhaustedMessage(
        { scope: 'daily', renewsAt: '2026-11-25T03:00:00Z' },
        'America/Santiago',
      ),
    ).toContain('25 nov. 2026, 12:00 a. m.');
  });

  it('disabled: no date', () => {
    expect(quotaExhaustedMessage({ scope: 'disabled' }, LIMA)).toBe(
      'Tu organización no tiene simulaciones habilitadas.',
    );
  });

  it('falls back to the generic copy without details', () => {
    expect(quotaExhaustedMessage(undefined, LIMA)).toBe('Alcanzaste tu límite de simulaciones.');
  });
});

describe('setupLimitMessage', () => {
  it('tells from when the seller can configure again', () => {
    expect(setupLimitMessage({ reason: 'success', retryAt: '2026-11-25T05:00:00Z' }, LIMA)).toBe(
      'Alcanzaste el máximo de configuraciones de hoy. Podrás volver a configurar desde el 25 nov. 2026, 12:00 a. m.',
    );
  });

  it('explains the failure cap differently', () => {
    expect(setupLimitMessage({ reason: 'failure', retryAt: '2026-11-25T05:00:00Z' }, LIMA)).toBe(
      'Alcanzaste el máximo de intentos fallidos de configuración de hoy. Podrás volver a configurar desde el 25 nov. 2026, 12:00 a. m.',
    );
  });

  it('falls back to the generic copy without details', () => {
    expect(setupLimitMessage(undefined, LIMA)).toBe(
      'Alcanzaste el máximo de configuraciones de hoy.',
    );
  });
});
