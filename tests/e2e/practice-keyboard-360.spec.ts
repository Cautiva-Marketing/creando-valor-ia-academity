import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { createSeller } from './fixtures/factories';
import { expect, test } from './fixtures/test';

/**
 * Keyboard only at 360 px (T190; FR-060, SC-001 technical, SC-010): Hoy → product → objection → configure →
 * start → 4 messages → finish → result → quote → history. Every interaction is Tab / Shift+Tab,
 * arrows, Space, Enter or typing; no clicks. The fake provider answers and evaluates.
 */
const tag = () => randomUUID().slice(0, 6);

/** Presses Tab (then Shift+Tab) until `target` has the focus (fails after `max` presses each way). */
async function tabTo(page: Page, target: Locator, max = 120) {
  await expect(target).toBeVisible();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < max; i++) {
      if (await target.evaluate((el) => el === document.activeElement)) return;
      await page.keyboard.press(key);
    }
  }
  throw new Error(`could not reach ${target} with the keyboard`);
}

async function activate(page: Page, target: Locator, key: 'Enter' | 'Space' = 'Enter') {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

test('recorrido completo solo con teclado a 360 px', async ({ page, loginAs }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'keyboard path at 360 px only');
  test.setTimeout(180_000);
  const seller = await createSeller();
  await loginAs({ email: seller.email, password: seller.password });
  await page.goto('/inicio');

  // Hoy → register a product.
  await activate(page, page.getByRole('link', { name: 'Registrar producto' }));
  await expect(page).toHaveURL(/\/productos\/nuevo$/);
  await tabTo(page, page.getByLabel('Rubro'));
  await page.keyboard.type('Inmobiliaria');
  await expect(page.getByLabel('Rubro')).not.toHaveValue('');
  await tabTo(page, page.getByLabel('Nombre del producto o servicio'));
  await page.keyboard.type('Lote Teclado');
  await tabTo(page, page.getByLabel('Precio (obligatorio)', { exact: true }));
  await page.keyboard.type('45 000');
  await tabTo(page, page.getByRole('textbox', { name: 'Beneficio 1' }));
  await page.keyboard.type('Saneamiento físico legal completo');
  await activate(page, page.getByRole('button', { name: 'Guardar producto' }));
  await expect(page.getByText('Guardamos tu producto (versión 1).')).toBeVisible();

  // Objection: the "Objeciones" tab with the arrows of the tab list.
  await tabTo(page, page.getByRole('tab', { name: 'Datos' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Objeciones' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const objectionForm = page.getByRole('form', { name: 'Nueva objeción' });
  await tabTo(page, objectionForm.getByLabel('Objeción'));
  await page.keyboard.type('Me queda muy lejos de Lima.');
  await activate(page, objectionForm.getByRole('button', { name: 'Agregar objeción' }));
  await expect(page.getByText('Agregamos la objeción.')).toBeVisible();

  // Configure from Hoy and start.
  await activate(page, page.getByRole('link', { name: 'Hoy' }).first());
  await expect(page).toHaveURL(/\/inicio$/);
  await activate(page, page.getByRole('link', { name: 'Configurar práctica' }));
  await expect(page).toHaveURL(/\/practicar$/);
  const setup = page.getByRole('form', { name: 'Configurar práctica' });
  await activate(
    page,
    setup.getByRole('checkbox', { name: 'Me queda muy lejos de Lima.' }),
    'Space',
  );
  await activate(page, setup.getByRole('button', { name: 'Preparar mi comprador' }));
  await expect(page.getByRole('heading', { name: 'Tu práctica está lista' })).toBeVisible();
  await activate(page, page.getByRole('button', { name: 'Comenzar' }));
  await expect(page.getByTestId('practice-session')).toBeVisible();

  // Four messages.
  const composer = page.getByRole('textbox', { name: 'Tu mensaje' });
  const buyer = page.getByRole('log').locator('[data-testid="chat-message"][data-author="buyer"]');
  for (let i = 1; i <= 4; i++) {
    await tabTo(page, composer);
    await page.keyboard.type(`Pregunta ${i} sobre lo que buscas ${tag()}`);
    await page.keyboard.press('Enter');
    await expect(buyer).toHaveCount(i + 1);
  }

  // Finish with the confirmation dialog.
  await activate(page, page.getByRole('button', { name: 'Terminar y evaluar' }));
  const dialog = page.getByRole('dialog', { name: '¿Terminar la práctica?' });
  await expect(dialog).toBeVisible();
  await activate(page, dialog.getByRole('button', { name: 'Terminar y evaluar' }));

  // Result → quote → back to the criterion.
  await expect(page.getByTestId('score-header')).toBeVisible({ timeout: 30_000 });
  const quote = page.getByTestId('quote-link').first();
  await activate(page, quote);
  const highlighted = page.locator('[data-highlighted="true"]');
  await expect(highlighted).toBeFocused();
  await activate(page, highlighted.getByRole('link', { name: /^Volver/ }));
  await expect(page.locator('[data-testid="criterion-card"]:focus')).toHaveCount(1);

  // History from the navigation.
  await activate(page, page.getByRole('link', { name: 'Historial' }).first(), 'Enter');
  await expect(page).toHaveURL(/\/historial$/);
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await expect(page.getByTestId('history-row')).toContainText('Lote Teclado');
});
