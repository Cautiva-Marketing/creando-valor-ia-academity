import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test';

/** US5 (FR-042): light / dark / system, applied instantly and without flash on reload. */

async function chooseTheme(page: Page, label: 'Claro' | 'Oscuro' | 'Sistema') {
  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitemradio', { name: label }).click();
  await page.keyboard.press('Escape');
}

const html = (page: Page) => page.locator('html');

test.describe('US5 · tema', () => {
  test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('vendedorA');
    // Records <html> classes when the parser inserts <main>, i.e. before any hydration.
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.getElementById('contenido')) {
          (window as unknown as { __classBeforeHydration: string }).__classBeforeHydration =
            document.documentElement.className;
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto('/inicio');
  });

  test('claro y oscuro se aplican al instante y persisten sin parpadeo al recargar', async ({
    page,
  }) => {
    await chooseTheme(page, 'Oscuro');
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await page.reload();
    expect(
      await page.evaluate(
        () => (window as unknown as { __classBeforeHydration: string }).__classBeforeHydration,
      ),
    ).toMatch(/\bdark\b/);
    await expect(html(page)).toHaveClass(/\bdark\b/);

    await chooseTheme(page, 'Claro');
    await expect(html(page)).toHaveClass(/\blight\b/);
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
    await page.reload();
    const before = await page.evaluate(
      () => (window as unknown as { __classBeforeHydration: string }).__classBeforeHydration,
    );
    expect(before).toMatch(/\blight\b/);
    expect(before).not.toMatch(/\bdark\b/);
  });

  test('con "Sistema" el tema sigue la preferencia del sistema en vivo', async ({ page }) => {
    await chooseTheme(page, 'Sistema');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    expect(
      await page.evaluate(
        () => (window as unknown as { __classBeforeHydration: string }).__classBeforeHydration,
      ),
    ).toMatch(/\bdark\b/);
  });
});
