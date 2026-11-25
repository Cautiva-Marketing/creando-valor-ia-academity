import { formatNumber, formatUsd } from '../../src/lib/format';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller, createSuperadmin } from './fixtures/factories';
import { createActiveSession } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/** US7 (FR-033, FR-006): aggregated usage by period, US$ totals, empty state, no conversation links. */

test.describe('US7 · consumo de IA', () => {
  test.beforeEach(async ({ loginAs }) => {
    const admin = await createSuperadmin();
    await loginAs({
      email: admin.email,
      password: admin.password,
      totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
    });
  });

  test('el mes actual muestra el consumo sembrado y el de una org de prueba con totales en US$', async ({
    page,
  }) => {
    const seller = await createSeller();
    // A started practice (002: ai_usage.simulation_id references practice_sessions; it consumes one).
    const { id: simulation } = await createActiveSession(seller);
    const { error } = await adminClient()
      .from('ai_usage')
      .insert([
        {
          organization_id: seller.orgId,
          user_id: seller.id,
          task: 'buyer',
          model: 'e2e',
          simulation_id: simulation,
          input_tokens: 1000,
          output_tokens: 250,
          latency_ms: 10,
          estimated_cost_usd: 0.0125,
        },
        {
          organization_id: seller.orgId,
          user_id: seller.id,
          task: 'evaluator',
          model: 'e2e',
          simulation_id: simulation,
          input_tokens: 500,
          output_tokens: 100,
          latency_ms: 10,
          estimated_cost_usd: 0.0075,
        },
      ]);
    expect(error).toBeNull();

    await page.goto('/admin/consumo?periodo=current_month');
    const row = page
      .locator('[data-row-key]')
      .filter({ visible: true })
      .filter({ hasText: seller.orgName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(formatNumber(1500));
    await expect(row).toContainText(formatNumber(350));
    await expect(row).toContainText(formatUsd(0.02));
    // Seeded organizations with usage this month appear too (read-only seed).
    await expect(
      page
        .locator('[data-row-key]')
        .filter({ visible: true })
        .filter({ hasText: 'Bruno Vendedor' }),
    ).toHaveCount(1);
    await expect(page.getByLabel('Totales del periodo')).toContainText('US$');
  });

  test('los periodos hoy, mes anterior y rango se aplican', async ({ page }) => {
    for (const periodo of ['today', 'previous_month']) {
      await page.goto(`/admin/consumo?periodo=${periodo}`);
      await expect(page.getByLabel('Periodo', { exact: true })).toHaveValue(periodo);
    }
    // Previous month has seeded usage for orgs A and B.
    await expect(
      page.locator('[data-row-key]').filter({ visible: true }).filter({ hasText: 'Ana Vendedora' }),
    ).toHaveCount(1);

    await page.goto('/admin/consumo');
    await page.getByLabel('Periodo', { exact: true }).selectOption('range');
    await page.getByLabel('Desde (rango)').fill('2020-01-01');
    await page.getByLabel('Hasta (rango)').fill('2020-01-31');
    await page.getByRole('button', { name: 'Ver consumo' }).click();
    await expect(page).toHaveURL(/periodo=range/);
    await expect(page.getByRole('heading', { name: 'Sin consumo en este periodo' })).toBeVisible();
  });

  test('un rango inválido se explica y vuelve al mes actual', async ({ page }) => {
    await page.goto('/admin/consumo?periodo=range&desde=2026-02-01&hasta=2026-01-01');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('anterior o igual');
    await expect(page.getByText(/^Mes actual:/)).toBeVisible();
  });

  test('ninguna vista enlaza a contenido de conversaciones (FR-006)', async ({ page }) => {
    for (const path of ['/admin/consumo?periodo=current_month', '/admin/organizaciones']) {
      await page.goto(path);
      const hrefs = await page
        .getByRole('main')
        .locator('a[href]')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
      for (const href of hrefs) expect(href).not.toMatch(/conversaci|simulaci|mensaj|transcrip/i);
    }
  });

  test('accesibilidad de /admin/consumo (axe)', async ({ page }) => {
    await page.goto('/admin/consumo?periodo=previous_month');
    await expectNoA11yViolations(page);
  });
});
