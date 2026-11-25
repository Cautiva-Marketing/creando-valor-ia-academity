import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { createSeller, type CreatedSeller } from './fixtures/factories';
import { createObjections, createProduct } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/** US2 · objeciones por producto (scenarios 1–5, quickstart 4; FR-006–FR-008). */

async function openObjections(
  page: Page,
  loginAs: (u: { email: string; password: string }) => Promise<void>,
  seller: CreatedSeller,
  productId: string,
) {
  await loginAs({ email: seller.email, password: seller.password });
  await page.goto(`/productos/${productId}?pestana=objeciones`);
  await expect(page.getByRole('heading', { name: 'Objeciones frecuentes' })).toBeVisible();
}

test.describe('US2 · objeciones', () => {
  test('estado vacío con sugerencias del sector; la sugerencia se copia y se ajusta', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, {
      name: 'Lote Brisas del Sur',
      sector: 'real_estate',
    });
    await openObjections(page, loginAs, seller, product.id);

    await expect(page.getByText('Aún no registras objeciones para este producto')).toBeVisible();
    await expect(page.getByTestId('objection-counter')).toContainText('0/20');
    await expect(
      page.getByRole('heading', { name: 'Sugerencias para Inmobiliaria' }),
    ).toBeVisible();
    for (const category of [
      'Precio',
      'Confianza',
      'Tiempo',
      'Competencia',
      'Distancia/logística',
      'Decisor',
    ]) {
      await expect(page.getByRole('group', { name: category })).toBeVisible();
    }
    await expectNoA11yViolations(page);

    await page
      .getByRole('group', { name: 'Distancia/logística' })
      .getByRole('button', { name: 'Me queda muy lejos de Lima.' })
      .click();
    const form = page.getByRole('form', { name: 'Nueva objeción' });
    const text = form.getByLabel('Objeción');
    await expect(text).toHaveValue('Me queda muy lejos de Lima.');
    await expect(text).toBeFocused();
    await expect(form.getByLabel('Categoría (opcional)')).toHaveValue('logistics');

    await text.fill('Me queda muy lejos de Lima y no tengo carro.');
    await form.getByRole('button', { name: 'Agregar objeción' }).click();
    await expect(page.getByText('Agregamos la objeción.')).toBeVisible();
    const list = page.getByRole('list', { name: 'Objeciones registradas' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Me queda muy lejos de Lima y no tengo carro.');
    await expect(list).toContainText('Distancia/logística');
    await expect(page.getByTestId('objection-counter')).toContainText('1/20');
    await expect(text).toHaveValue('');
  });

  test('alta manual, edición en línea y eliminación con confirmación', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, { name: 'Taladro 800 W', sector: 'hardware' });
    await createObjections(seller, product.id, [
      { text: 'En el mercado lo encuentro más barato.', category: 'competition' },
    ]);
    await openObjections(page, loginAs, seller, product.id);

    const form = page.getByRole('form', { name: 'Nueva objeción' });
    await form.getByLabel('Objeción').fill('Caro');
    await form.getByRole('button', { name: 'Agregar objeción' }).click();
    await expect(form.getByText('Escribe la objeción (al menos 5 caracteres).')).toBeVisible();
    await expect(form.getByLabel('Objeción')).toHaveValue('Caro');

    await form.getByLabel('Objeción').fill('No sé si la garantía cubre el motor.');
    await form.getByRole('button', { name: 'Agregar objeción' }).click();
    const list = page.getByRole('list', { name: 'Objeciones registradas' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('objection-counter')).toContainText('2/20');

    // Inline edit.
    await list
      .getByRole('button', { name: 'Editar objeción: No sé si la garantía cubre el motor.' })
      .click();
    const edit = page.getByRole('form', { name: 'Editar objeción' });
    await expect(edit.getByLabel('Objeción')).toBeFocused();
    await edit.getByLabel('Objeción').fill('¿La garantía cubre el motor?');
    await edit.getByLabel('Categoría (opcional)').selectOption({ label: 'Confianza' });
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Guardamos la objeción.')).toBeVisible();
    await expect(list).toContainText('¿La garantía cubre el motor?');
    await expect(list).toContainText('Confianza');
    await expect(
      list.getByRole('button', { name: 'Editar objeción: ¿La garantía cubre el motor?' }),
    ).toBeFocused();

    // Deletion with confirmation.
    await list
      .getByRole('button', { name: 'Eliminar objeción: En el mercado lo encuentro más barato.' })
      .click();
    const dialog = page.getByRole('dialog', { name: '¿Eliminar esta objeción?' });
    await expect(dialog).toContainText('Las prácticas que ya la usaron conservan su texto.');
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Eliminamos la objeción.')).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId('objection-counter')).toContainText('1/20');
  });

  test('con 20 objeciones se indica el máximo', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, { name: 'Plan Empresas', sector: 'telecom' });
    await createObjections(
      seller,
      product.id,
      Array.from({ length: 20 }, (_, i) => `Objeción de prueba número ${i + 1}.`),
    );
    await openObjections(page, loginAs, seller, product.id);

    await expect(page.getByTestId('objection-counter')).toContainText('20/20');
    await expect(
      page.getByText('Alcanzaste el máximo de 20 objeciones para este producto.'),
    ).toBeVisible();
    await expect(page.getByRole('form', { name: 'Nueva objeción' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Sugerencias para/ })).toHaveCount(0);
  });

  test('sugerencia y alta solo con teclado a 360 px', async ({ page, loginAs }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'recorrido de teclado en móvil');
    const seller = await createSeller();
    const product = await createProduct(seller, {
      name: 'Menú del día',
      sector: 'restaurants',
      priceKind: 'fixed',
      priceMin: 15,
    });
    await openObjections(page, loginAs, seller, product.id);

    const chip = page.getByRole('group', { name: 'Precio' }).getByRole('button').first();
    await chip.focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('form', { name: 'Nueva objeción' });
    await expect(form.getByLabel('Objeción')).toBeFocused();
    await expect(form.getByLabel('Categoría (opcional)')).toHaveValue('price');
    await page.keyboard.press('Tab');
    await expect(form.getByLabel('Categoría (opcional)')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(form.getByRole('button', { name: 'Agregar objeción' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('list', { name: 'Objeciones registradas' }).getByRole('listitem'),
    ).toHaveCount(1);
    await expect(form.getByLabel('Objeción')).toBeFocused();
    const viewport = page.viewportSize();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport!.width,
    );
    await expectNoA11yViolations(page);
  });
});
