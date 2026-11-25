import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { createSeller, type CreatedSeller } from './fixtures/factories';
import { createProduct } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US1 · Mis productos (scenarios 1–6, quickstart 2–3; FR-001–FR-005). Each test uses its own
 * factory seller; seeded sellers are never modified.
 */

const NOTICE =
  /Usa datos ficticios o autorizados;\s*no ingreses datos personales de clientes reales/;

async function signIn(
  page: Page,
  loginAs: (u: { email: string; password: string }) => Promise<void>,
  seller: CreatedSeller,
  path = '/productos',
) {
  await loginAs({ email: seller.email, password: seller.password });
  await page.goto(path);
}

test.describe('US1 · mis productos', () => {
  test('estado vacío guiado y alta con rango de precio', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await signIn(page, loginAs, seller);

    await expect(page.getByRole('heading', { name: 'Aún no registras productos' })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('link', { name: 'Registrar mi primer producto' }).click();
    await expect(page).toHaveURL(/\/productos\/nuevo$/);
    await expect(page.getByRole('complementary', { name: 'Aviso sobre los datos' })).toHaveText(
      NOTICE,
    );
    await expectNoA11yViolations(page);

    await page.getByLabel('Rubro').selectOption({ label: 'Inmobiliaria' });
    await page.getByLabel('Nombre del producto o servicio').fill('Lote Las Palmeras');
    await page
      .getByLabel('Descripción')
      .fill('Lotes de 120 m² a 10 minutos de la Panamericana Sur.');
    await expect(page.getByText('52 de 1.000 caracteres')).toBeVisible();
    await page.getByRole('radio', { name: 'Rango (mínimo y máximo)' }).click();
    await page.getByLabel('Precio mínimo').fill('45 000');
    await page.getByLabel('Precio máximo').fill('60 000,50');
    await page
      .getByRole('textbox', { name: 'Beneficio 1' })
      .fill('Saneamiento físico legal completo');
    await page.getByRole('button', { name: 'Agregar beneficio' }).click();
    await expect(page.getByRole('textbox', { name: 'Beneficio 2' })).toBeFocused();
    await page.keyboard.type('Cerca de la playa');
    await page.getByRole('button', { name: 'Agregar dato verificable' }).click();
    await page.keyboard.type('Partida registral inscrita en Sunarp');
    await page.getByRole('button', { name: 'Guardar producto' }).click();

    await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Guardamos tu producto (versión 1).')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lote Las Palmeras', level: 1 })).toBeVisible();
    await expect(page.getByTestId('current-version')).toContainText('Versión 1 ·');

    await page.goto('/productos');
    const card = page.getByRole('link', { name: /Lote Las Palmeras/ });
    await expect(card).toContainText('Inmobiliaria · Versión 1');
    await expect(card).toContainText('S/ 45 000,00 – S/ 60 000,50');
    await expect(card).toContainText('0 objeciones');
    await expectNoA11yViolations(page);
  });

  test('errores por campo sin perder lo escrito', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await signIn(page, loginAs, seller, '/productos/nuevo');

    await page.getByLabel('Rubro').selectOption({ label: 'Ferretería' });
    await page.getByLabel('Nombre del producto o servicio').fill('   ');
    await page.getByRole('radio', { name: 'Rango (mínimo y máximo)' }).click();
    await page.getByLabel('Precio mínimo').fill('900');
    await page.getByLabel('Precio máximo').fill('100');
    await page.getByRole('button', { name: 'Quitar beneficio 1' }).click();
    await expect(page.getByRole('button', { name: 'Agregar beneficio' })).toBeFocused();
    await page.getByRole('button', { name: 'Guardar producto' }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'Revisa los campos marcados.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Nombre del producto o servicio')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(
      page.getByText('Escribe el nombre del producto (al menos 2 caracteres).'),
    ).toBeVisible();
    await expect(page.getByText('Agrega al menos un beneficio.')).toBeVisible();
    // Kept values.
    await expect(page.getByLabel('Rubro')).toHaveValue('hardware');
    await expect(page.getByLabel('Precio mínimo')).toHaveValue('900');
    await expect(page.getByLabel('Precio máximo')).toHaveValue('100');

    // Fix name and benefit: now the price range is reported.
    await page.getByLabel('Nombre del producto o servicio').fill('Taladro percutor');
    await page.getByRole('button', { name: 'Agregar beneficio' }).click();
    await page.keyboard.type('Garantía de 2 años');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(
      page.getByText('El precio máximo debe ser mayor o igual al mínimo.'),
    ).toBeVisible();
    await expect(page.getByLabel('Precio máximo')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Precio mínimo').fill('-5');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByText(/Escribe un monto válido/).first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('editar crea la versión 2 y la pestaña Versiones conserva la 1', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, {
      name: 'Plan Hogar 200 Mbps',
      sector: 'telecom',
      priceKind: 'fixed',
      priceMin: 89.9,
    });
    await signIn(page, loginAs, seller, `/productos/${product.id}`);

    await expect(page.getByTestId('current-version')).toContainText('Versión 1 ·');
    await expect(page.getByLabel('Precio (obligatorio)', { exact: true })).toHaveValue('89,90');
    await page.getByLabel('Nombre del producto o servicio').fill('Plan Hogar 300 Mbps');
    await page.getByLabel('Precio (obligatorio)', { exact: true }).fill('99,90');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Guardamos la versión 2.')).toBeVisible();
    await expect(page.getByTestId('current-version')).toContainText('Versión 2 ·');
    await expect(
      page.getByRole('heading', { name: 'Plan Hogar 300 Mbps', level: 1 }),
    ).toBeVisible();

    // Saving the same content does not create a version.
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('No hubo cambios; sigue vigente la versión 2.')).toBeVisible();

    await page.getByRole('tab', { name: 'Versiones' }).click();
    const versions = page.getByRole('list', { name: 'Versiones del producto' });
    await expect(versions.getByRole('listitem').filter({ hasText: /^Versión/ })).toHaveCount(2);
    await expect(versions).toContainText('Versión 2');
    await expect(versions).toContainText('Vigente');
    await versions.getByText(/^Versión 1 ·/).click();
    await expect(versions).toContainText('Plan Hogar 200 Mbps');
    await expect(versions).toContainText('S/ 89,90');
    await expectNoA11yViolations(page);
  });

  test('archivar con confirmación, filtro Archivados y reactivar', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, {
      name: 'Ahorro Cooperativo Plus',
      sector: 'cooperative',
    });
    await signIn(page, loginAs, seller, `/productos/${product.id}`);

    await page.getByRole('button', { name: 'Archivar' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Archivar Ahorro Cooperativo Plus?' });
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Archivar' }).click();
    await expect(page.getByText('Archivamos Ahorro Cooperativo Plus.')).toBeVisible();
    await expect(page.getByText('Archivado', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Practicar con este producto' })).toHaveCount(0);

    await page.goto('/productos');
    await expect(page.getByRole('heading', { name: 'No tienes productos archivados' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: /Ahorro Cooperativo Plus/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Archivados', exact: true }).click();
    await expect(page).toHaveURL(/estado=archivados/);
    await expect(page.getByRole('link', { name: 'Archivados', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('link', { name: /Ahorro Cooperativo Plus/ }).click();

    await page.getByRole('button', { name: 'Reactivar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByText('Reactivamos Ahorro Cooperativo Plus.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Practicar con este producto' })).toHaveAttribute(
      'href',
      `/practicar?producto=${product.id}`,
    );
  });

  test('búsqueda por nombre con ?q=', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await createProduct(seller, {
      name: 'Menú ejecutivo',
      sector: 'restaurants',
      priceKind: 'fixed',
      priceMin: 18,
    });
    await createProduct(seller, {
      name: 'Curso de Excel',
      sector: 'education',
      priceKind: 'fixed',
      priceMin: 350,
    });
    await signIn(page, loginAs, seller);

    await page.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('menú');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/q=men%C3%BA|q=men%c3%ba/i);
    await expect(page.getByRole('link', { name: /Menú ejecutivo/ })).toContainText('S/ 18,00');
    await expect(page.getByRole('link', { name: /Curso de Excel/ })).toHaveCount(0);

    await page.goto('/productos?q=zzz');
    await expect(
      page.getByRole('heading', { name: 'No hay productos con ese nombre' }),
    ).toBeVisible();
  });

  test('alta solo con teclado a 360 px', async ({ page, loginAs }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'recorrido de teclado en móvil');
    const seller = await createSeller();
    await signIn(page, loginAs, seller, '/productos/nuevo');

    await page.getByLabel('Rubro').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Nombre del producto o servicio')).toBeFocused();
    await page.keyboard.type('Consultoría contable');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Contabilidad mensual para pymes.');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'Precio fijo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Precio (obligatorio)', { exact: true })).toBeFocused();
    await page.keyboard.type('1 250,50');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Beneficio 1' })).toBeFocused();
    await page.keyboard.type('Declaraciones a tiempo');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Beneficio 2' })).toBeFocused();
    await page.keyboard.type('Asesoría por WhatsApp');

    const submit = page.getByRole('button', { name: 'Guardar producto' });
    for (
      let i = 0;
      i < 20 && !(await submit.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(submit).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { name: 'Consultoría contable', level: 1 }),
    ).toBeVisible();
    const viewport = page.viewportSize();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport!.width,
    );
  });
});
