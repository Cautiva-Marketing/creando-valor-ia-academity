import { expectNoA11yViolations } from './fixtures/axe';
import { createSuperadmin } from './fixtures/factories';
import { expect, test } from './fixtures/test';

/** US6 (FR-043, FR-044, FR-045, SC-012). */

const COMPONENTS = [
  'button',
  'input',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'switch',
  'badge',
  'card',
  'table',
  'tabs',
  'dialog',
  'sheet',
  'toast',
  'tooltip',
  'skeleton',
  'empty-state',
  'progress',
  'gauge',
  'score-ring',
  'avatar',
  'menu',
  'chip',
  'score-trend-chart',
  'cautiva-strip',
  'highlight',
];

test.describe('US6 · /design', () => {
  test.describe('superadmin', () => {
    test.beforeEach(async ({ loginAs }) => {
      const admin = await createSuperadmin();
      await loginAs({
        email: admin.email,
        password: admin.password,
        totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
      });
    });

    test('documenta tokens con ratios de contraste y los 23 componentes en ambos paneles', async ({
      page,
    }) => {
      await page.goto('/design');
      await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();

      const tokens = page.getByTestId('tokens-section');
      for (const heading of [
        'Colores semánticos',
        'Pares de contraste (WCAG 2.2 AA)',
        'Tipografía',
        'Espaciado (unidad de 4 px)',
        'Radios',
        'Elevación',
        'Movimiento',
      ]) {
        await expect(tokens.getByRole('heading', { name: heading })).toBeVisible();
      }
      const ratios = page.getByTestId('contrast-pairs').locator('[data-contrast-ratio]');
      expect(await ratios.count()).toBeGreaterThan(20);
      for (const value of await ratios.evaluateAll((nodes) =>
        nodes.map((n) => Number(n.getAttribute('data-contrast-ratio'))),
      )) {
        expect(value).toBeGreaterThanOrEqual(3);
      }

      for (const theme of ['light', 'dark']) {
        const panel = page.getByTestId(`panel-${theme}`);
        await expect(panel).toHaveClass(new RegExp(`\\b${theme}\\b`));
        for (const component of COMPONENTS) {
          await expect(
            panel.locator(`[data-component="${component}"]`),
            `${component} in ${theme}`,
          ).toHaveCount(1);
        }
        await expect(panel.locator('[data-component="pagination"]')).toHaveCount(1);
      }
      // FR-043: the page adapts to 360 px without horizontal scroll.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('gauge y anillo exponen role="meter" con aria-valuenow', async ({ page }) => {
      await page.goto('/design');
      const meters = page.getByTestId('panel-light').getByRole('meter');
      await expect(meters).toHaveCount(5);
      await expect(
        page.getByTestId('panel-light').getByRole('meter', { name: 'Desempeño general' }),
      ).toHaveAttribute('aria-valuenow', '72');
      await expect(
        page.getByTestId('panel-light').getByRole('meter', { name: 'Puntaje de la simulación' }),
      ).toHaveAttribute('aria-valuenow', '88');
    });

    test('con movimiento reducido los medidores no se animan', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/design');
      const arcs = page.getByTestId('panel-light').locator('[data-reduced-motion]');
      await expect(arcs.first()).toHaveAttribute('data-reduced-motion', 'true');
      expect(
        await arcs.evaluateAll((nodes) =>
          nodes.every((n) => n.getAttribute('data-reduced-motion') === 'true'),
        ),
      ).toBe(true);
      const running = await page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === 'running').length,
      );
      expect(running).toBe(0);
    });

    test('accesibilidad de /design (axe)', async ({ page }) => {
      test.slow();
      await page.goto('/design');
      await expectNoA11yViolations(page);
    });
  });

  test('un vendedor recibe "sin permiso" (403)', async ({ page, loginAs }) => {
    await loginAs('vendedorA');
    const response = await page.goto('/design');
    expect(response?.status()).toBe(403);
    await expect(
      page.getByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeVisible();
  });

  test('un superadmin con aal1 va a verificar su segundo factor', async ({ page, loginAs }) => {
    await loginAs('superadminAal1');
    await page.goto('/design');
    await expect(page).toHaveURL(/\/mfa\/verificar(\?|$)/);
  });
});
