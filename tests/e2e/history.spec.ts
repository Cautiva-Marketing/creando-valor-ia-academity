import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller } from './fixtures/factories';
import {
  createActiveSession,
  createConfiguredSession,
  createEvaluatedSession,
  createProduct,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US8 · historial (scenarios 1–6; quickstart 16; FR-049, FR-050). Product A: an evaluated session with
 * the default breakdown (weakest stage: Innova, 60 %), an active one and a failed evaluation; product
 * B: an evaluated session with Aumenta at 30 %. A configured session is never listed.
 */
test.describe('US8 · historial', () => {
  test('lista, filtros en la URL, gráfico con tabla, franja y acciones', async ({
    page,
    context,
    loginAs,
  }) => {
    const seller = await createSeller();
    const productA = await createProduct(seller);
    const productB = await createProduct(seller, { name: 'Curso de prueba B' });
    await createEvaluatedSession(seller, { product: productA, difficulty: 2 });
    const failed = await createActiveSession(seller, { product: productA, sellerMessages: 1 });
    const { error } = await adminClient()
      .from('practice_sessions')
      .update({
        status: 'finalized',
        end_reason: 'seller_ended',
        ended_at: new Date().toISOString(),
        evaluation_status: 'failed',
        evaluation_failure_code: 'provider_error',
        evaluation_due_at: new Date().toISOString(),
      })
      .eq('id', failed.id);
    expect(error).toBeNull();
    await createEvaluatedSession(seller, {
      product: productB,
      difficulty: 4,
      scores: { first_impression: 9, diagnosis: 18, value_argument: 6, objection_handling: 15 },
    });
    const active = await createActiveSession(seller, { product: productA });
    await createConfiguredSession(seller, { product: productA });

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto('/historial');
    await expect(page.getByRole('heading', { name: 'Historial', level: 1 })).toBeVisible();

    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(4);
    await expect(page.getByTestId('history-count')).toHaveText('4 prácticas');
    await expect(rows.first()).toHaveAttribute('data-status', 'active');
    await expect(rows.first().getByRole('link', { name: 'Retomar' })).toHaveAttribute(
      'href',
      `/practicas/${active.id}`,
    );
    const evaluatedB = rows.filter({ hasText: 'Curso de prueba B' });
    await expect(evaluatedB).toContainText('(v1)');
    await expect(evaluatedB).toContainText('Dificultad 4');
    await expect(evaluatedB).toContainText('Evaluada');
    const failedRow = rows.filter({ hasText: 'Evaluación fallida' });
    await expect(failedRow.getByRole('button', { name: 'Reintentar evaluación' })).toBeVisible();

    // Chart (2 evaluated) with its table alternative.
    const chart = page.getByTestId('score-trend-chart');
    await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /2 prácticas evaluadas/);
    await chart.getByRole('button', { name: 'Ver como tabla' }).click();
    await expect(chart.getByRole('table').getByRole('row')).toHaveCount(3);
    await expect(chart.getByRole('button', { name: 'Ver como gráfico' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Weakest stage overall: Aumenta ((70 + 30) / 2 = 50 %; tie with Transforma → canonical order),
    // marked with text, not only color.
    const weakest = page.locator('[data-testid="cautiva-stage"][data-weakest]');
    await expect(weakest).toHaveCount(1);
    await expect(weakest).toHaveAttribute('data-stage', 'aumenta');
    await expect(weakest).toContainText('Etapa a reforzar');
    await expect(page.locator('[data-stage="une"]')).toContainText('sin datos');
    await expectNoA11yViolations(page);

    // Product filter → URL; list, chart and strip reflect it (product A alone: Innova, 60 %).
    await page.getByLabel('Producto').selectOption(productA.id);
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(new RegExp(`/historial\\?producto=${productA.id}$`));
    await expect(rows).toHaveCount(3);
    await expect(page.getByTestId('score-trend-chart')).toHaveCount(0);
    await expect(weakest).toHaveAttribute('data-stage', 'innova');

    // The same URL in another tab restores the filters.
    const other = await context.newPage();
    await other.goto(page.url());
    await expect(other.getByLabel('Producto')).toHaveValue(productA.id);
    await expect(other.getByTestId('history-row')).toHaveCount(3);
    await other.close();

    // Difficulty + date range; then "Limpiar".
    await page.goto('/historial?dificultad=2&desde=2000-01-01&hasta=2000-01-02');
    await expect(page.getByLabel('Dificultad')).toHaveValue('2');
    await expect(page.getByText('No hay prácticas con estos filtros')).toBeVisible();
    await page.getByRole('link', { name: 'Limpiar', exact: true }).click();
    await expect(page).toHaveURL(/\/historial$/);
    await expect(rows).toHaveCount(4);

    // "Reintentar evaluación" from the list opens the practice.
    await rows
      .filter({ hasText: 'Evaluación fallida' })
      .getByRole('button', { name: 'Reintentar evaluación' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/practicas/${failed.id}$`));
  });

  test('vacío: "Configura tu primera práctica"', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await createConfiguredSession(seller);
    await loginAs({ email: seller.email, password: seller.password });
    await page.goto('/historial');
    await expect(page.getByRole('link', { name: 'Configura tu primera práctica' })).toHaveAttribute(
      'href',
      '/practicar',
    );
    await expect(page.getByTestId('cautiva-strip')).toHaveCount(0);
    await expectNoA11yViolations(page);
  });
});
