import { expectNoA11yViolations } from './fixtures/axe';
import { createSeller } from './fixtures/factories';
import { bumpProductVersion, createEvaluatedSession } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US7 · resultado (scenarios 1–4, 6–7; quickstart 13; FR-046, FR-047). The evaluated session is seeded
 * with a known breakdown: active_listening is no_evaluable and the evidence of every criterion is m2.
 */
const SELLER_M2 = 'Mensaje de prueba 1: ¿qué es lo más importante para usted?';

test.describe('US7 · resultado de la práctica', () => {
  test('cabecera, desglose, banderas, ficha revelada y transcripción', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createEvaluatedSession(seller, {
      difficulty: 4,
      hintsEnabled: false,
      flags: [
        {
          type: 'undue_pressure',
          explanation: 'Presionaste con una urgencia que no existe.',
          seqs: [4],
        },
      ],
    });
    // A later product version does not change the result (FR-002).
    await bumpProductVersion(seller, session.product, 'Lote renovado v2');

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${session.id}`);

    const header = page.getByTestId('score-header');
    await expect(header.getByTestId('evaluation-total')).toHaveText(`${session.total} de 100`);
    await expect(header.getByRole('meter', { name: /Puntaje total/ })).toHaveAttribute(
      'aria-valuenow',
      String(session.total),
    );
    await expect(header.getByTestId('evaluation-level')).toHaveText('En desarrollo');
    const meta = header.getByTestId('result-meta');
    await expect(meta).toContainText('Terminada por el vendedor');
    await expect(meta).toContainText(`${session.product.name} · versión 1`);
    await expect(meta).toContainText('4 ·');
    await expect(meta).toContainText('Desactivadas');
    await expect(header).toContainText('Evaluación automática y orientativa');

    const cards = page.getByTestId('criterion-card');
    await expect(cards).toHaveCount(7);
    const diagnosis = page.locator('[data-criterion="diagnosis"]');
    await expect(diagnosis.getByTestId('criterion-score')).toHaveText('15 / 20');
    await expect(diagnosis.getByRole('progressbar')).toBeVisible();
    await expect(diagnosis.getByTestId('criterion-confidence')).toHaveText('Confianza: Alta');
    await expect(diagnosis).toContainText('Para mejorar:');
    const value = page.locator('[data-criterion="value_argument"]');
    await expect(value.getByText('Aumenta')).toBeVisible();
    await expect(value.getByText('Transforma')).toBeVisible();
    const listening = page.locator('[data-criterion="active_listening"]');
    await expect(listening.getByTestId('criterion-score')).toHaveText('No evaluable');
    await expect(listening).toContainText('No suma ni resta');
    await expect(listening.getByTestId('quote-link')).toHaveCount(0);

    await expect(page.getByTestId('strengths')).toContainText('Preguntaste por el objetivo');
    await expect(page.getByTestId('improvements')).toContainText('Explora la objeción');
    const flags = page.getByTestId('ethical-flags');
    await expect(flags.getByTestId('ethical-flag')).toHaveCount(1);
    await expect(flags).toContainText('Presión indebida');
    await expect(flags.getByTestId('quote-link')).toContainText('Mensaje de prueba 2');

    await expect(page.getByTestId('suggested-drill')).toContainText('Innova');
    const revealed = page.getByTestId('buyer-revealed');
    await expect(revealed.locator('[data-discovered="true"]')).toContainText('Presupuesto');
    await expect(revealed.locator('[data-discovered="false"]')).toHaveCount(2);
    await expect(revealed.getByTestId('hidden-objection')).toHaveAttribute('data-raised', 'false');
    await expect(page.getByTestId('transcript-message')).toHaveCount(5);

    await expectNoA11yViolations(page);
  });

  test('cita con Enter → foco y resaltado del mensaje → "Volver al criterio"', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createEvaluatedSession(seller);
    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${session.id}`);

    const quote = page.locator('[data-criterion="diagnosis"]').getByTestId('quote-link');
    await expect(quote).toHaveText(`Ver en la conversación: “${SELLER_M2}”`);
    // Visible first: with loading.tsx the content streams inside a hidden container, where
    // toHaveText already matches but focus() does nothing.
    await expect(quote).toBeVisible();
    await quote.focus();
    await expect(quote).toBeFocused();
    await page.keyboard.press('Enter');

    const message = page.locator('#m2');
    await expect(message).toBeFocused();
    await expect(message).toHaveAttribute('data-highlighted', 'true');
    await expect(page).toHaveURL(/#m2$/);
    const back = message.getByRole('link', { name: 'Volver al criterio' });
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#criterio-diagnosis')).toBeFocused();
    await expect(message).not.toHaveAttribute('data-highlighted');
  });

  test('sin criterios evaluables → "Sin evidencia suficiente para calificar"', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createEvaluatedSession(seller, { scores: {} });
    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${session.id}`);

    await expect(page.getByTestId('evaluation-total')).toHaveText(
      'Sin evidencia suficiente para calificar',
    );
    await expect(page.getByRole('meter', { name: /Puntaje total/ })).toHaveCount(0);
    await expect(page.getByTestId('evaluation-level')).toHaveCount(0);
    await expect(
      page.getByTestId('criterion-score').filter({ hasText: 'No evaluable' }),
    ).toHaveCount(7);
    await expectNoA11yViolations(page);
  });
});
