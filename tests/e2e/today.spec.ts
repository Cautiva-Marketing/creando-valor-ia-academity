import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller } from './fixtures/factories';
import {
  createActiveSession,
  createConfiguredSession,
  createEvaluatedSession,
  createObjections,
  createProduct,
  setQuota,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US9 · "Hoy" (scenarios 1–6; quickstart 1, 17; FR-051, FR-052). The 001 "Retomar onboarding" card is
 * covered by onboarding.spec.ts.
 */
async function openToday(
  page: Page,
  loginAs: (u: { email: string; password: string }) => Promise<void>,
  seller: { email: string; password: string },
) {
  await loginAs(seller);
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^(Buenos días|Buenas tardes|Buenas noches)/,
  );
}

test.describe('US9 · Hoy', () => {
  test('sin productos → pasos guiados; sin objeciones → "Agrega objeciones"', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    await openToday(page, loginAs, seller);
    const next = page.getByTestId('next-action');
    await expect(next).toHaveAttribute('data-kind', 'register_product');
    await expect(next.getByRole('link', { name: 'Registrar producto' })).toHaveAttribute(
      'href',
      '/productos/nuevo',
    );
    const steps = page.getByTestId('guided-step');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(steps.nth(0)).toContainText('(pendiente)');
    await expect(page.getByTestId('last-result')).toHaveCount(0);
    await expect(page.getByTestId('cautiva-strip')).toHaveCount(0);
    await expect(page.getByTestId('quota-summary')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Accesos rápidos' })).toBeVisible();
    await expectNoA11yViolations(page);

    const product = await createProduct(seller);
    await page.reload();
    await expect(next).toHaveAttribute('data-kind', 'add_objections');
    await expect(next.getByRole('heading', { name: 'Agrega objeciones' })).toBeVisible();
    await expect(next.getByRole('link', { name: 'Agregar objeciones' })).toHaveAttribute(
      'href',
      `/productos/${product.id}`,
    );
    await expect(steps.nth(0)).toContainText('(hecho)');

    await createObjections(seller, product.id);
    await page.reload();
    await expect(next.getByRole('heading', { name: 'Haz tu primera práctica' })).toBeVisible();
    await expect(next.getByRole('link', { name: 'Configurar práctica' })).toHaveAttribute(
      'href',
      '/practicar',
    );
  });

  test('último resultado con tendencia, franja de las últimas 5 y "Practica <etapa>"', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const productA = await createProduct(seller);
    const productB = await createProduct(seller);
    const older = await createEvaluatedSession(seller, { product: productA }); // 72
    const { error } = await adminClient()
      .from('practice_sessions')
      .update({ started_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
      .eq('id', older.id);
    expect(error).toBeNull();
    const latest = await createEvaluatedSession(seller, {
      product: productB,
      scores: {
        first_impression: 10,
        diagnosis: 20,
        value_argument: 20,
        objection_handling: 15,
        negotiation_close: 15,
        follow_up: 4,
      },
    }); // 93; Asegura averages (70 + 40) / 2 = 55 %, the weakest stage.

    await openToday(page, loginAs, seller);
    const last = page.getByTestId('last-result');
    await expect(last.getByTestId('last-result-score')).toHaveText(`${latest.total} de 100`);
    await expect(last).toContainText('Avanzado');
    await expect(last.getByTestId('last-result-trend')).toHaveText(
      `Subiste ${latest.total! - older.total!} puntos frente a la práctica anterior`,
    );
    await expect(last.getByRole('link', { name: 'Ver resultado' })).toHaveAttribute(
      'href',
      `/practicas/${latest.id}`,
    );

    const strip = page.getByTestId('cautiva-strip');
    await expect(strip).toContainText('últimas 5');
    await expect(strip.locator('[data-weakest]')).toHaveAttribute('data-stage', 'asegura');
    await expect(page.getByTestId('guided-steps')).toHaveCount(0);

    const next = page.getByTestId('next-action');
    await expect(next.getByRole('heading', { name: 'Practica Asegura' })).toBeVisible();
    await expect(next.getByRole('link', { name: 'Practicar Asegura' })).toHaveAttribute(
      'href',
      `/practicar?producto=${productB.id}&foco=asegura`,
    );
    await expectNoA11yViolations(page);

    // Quota exhausted: reason and renewal instead of the button (both sessions consumed today).
    await setQuota(seller.orgId, 2, 30);
    await page.reload();
    await expect(next.getByTestId('quota-blocked')).toBeVisible();
    await expect(next.getByRole('link', { name: 'Practicar Asegura' })).toHaveCount(0);
    await expect(page.getByTestId('quota-summary')).toHaveCount(0);
  });

  test('práctica en curso primero con "Retomar"; configurada → "Continuar"', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const configured = await createConfiguredSession(seller);
    await openToday(page, loginAs, seller);
    const card = page.getByTestId('ongoing-practice');
    await expect(card.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      `/practicas/${configured.id}`,
    );

    const { error } = await adminClient()
      .from('practice_sessions')
      .update({ status: 'discarded', discarded_at: new Date().toISOString() })
      .eq('id', configured.id);
    expect(error).toBeNull();
    const active = await createActiveSession(seller, { product: configured.product });
    await page.reload();
    await expect(card).toContainText('Tienes una práctica en curso');
    await expect(card.getByRole('link', { name: 'Retomar' })).toHaveAttribute(
      'href',
      `/practicas/${active.id}`,
    );
    // It comes before the recommended action.
    const order = await page
      .locator('[data-testid="ongoing-practice"], [data-testid="next-action"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
    expect(order).toEqual(['ongoing-practice', 'next-action']);
    await expectNoA11yViolations(page);
  });
});
