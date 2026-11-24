import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, auditEventsFor, createSeller, createSuperadmin } from './fixtures/factories';
import { expect, test } from './fixtures/test';
import { signIn } from './fixtures/auth';

/**
 * US7 (FR-024a, FR-030, FR-031). The organization and its seller are created by the factory (never the
 * seeded org A); the row is located by searching the organization's unique name.
 */

async function openRow(page: Page, name: string) {
  await page.goto(`/admin/organizaciones?q=${encodeURIComponent(name)}`);
  const row = page.locator('[data-row-key]').filter({ visible: true }).filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return row;
}

async function quotaOf(orgId: string) {
  const { data } = await adminClient()
    .from('quotas')
    .select('daily_limit, monthly_limit')
    .eq('organization_id', orgId)
    .single();
  return data;
}

test.describe('US7 · organizaciones', () => {
  test.beforeEach(async ({ loginAs }) => {
    const admin = await createSuperadmin();
    await loginAs({
      email: admin.email,
      password: admin.password,
      totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
    });
  });

  test('el listado muestra nombre, tipo, estado, creación, cuota y consumo del mes', async ({
    page,
  }) => {
    const seller = await createSeller();
    await page.goto('/admin/organizaciones');
    for (const header of [
      'Nombre',
      'Tipo',
      'Estado',
      'Creación',
      'Cuota diaria / mensual',
      'Simulaciones del mes',
    ]) {
      await expect(
        page.getByText(header, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    const row = await openRow(page, seller.orgName);
    await expect(row).toContainText('Personal');
    await expect(row).toContainText('Activa');
    await expect(row).toContainText('10 / 100');
  });

  test('una cuota inválida se rechaza y una válida se guarda y audita', async ({ page }) => {
    const seller = await createSeller();
    const row = await openRow(page, seller.orgName);
    await row.getByRole('button', { name: /Editar cuota/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="dailyLimit"]').fill('5');
    await dialog.locator('input[name="monthlyLimit"]').fill('3');
    await dialog.getByRole('button', { name: 'Guardar cuota' }).click();
    await expect(
      dialog.getByText('El límite diario no puede ser mayor que el mensual.'),
    ).toBeVisible();
    expect(await quotaOf(seller.orgId)).toEqual({ daily_limit: 10, monthly_limit: 100 });

    await dialog.locator('input[name="dailyLimit"]').fill('3');
    await dialog.locator('input[name="monthlyLimit"]').fill('50');
    await dialog.getByRole('button', { name: 'Guardar cuota' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Guardamos la cuota de ${seller.orgName}.`)).toBeVisible();
    await expect(
      page.locator('[data-row-key]').filter({ visible: true }).filter({ hasText: seller.orgName }),
    ).toContainText('3 / 50');
    expect(await quotaOf(seller.orgId)).toEqual({ daily_limit: 3, monthly_limit: 50 });
    const audits = (await auditEventsFor(seller.orgId)).filter((e) => e.action === 'quota.updated');
    expect(audits).toHaveLength(1);
  });

  test('suspender exige motivo, corta el acceso del vendedor y reactivar lo devuelve', async ({
    page,
    browser,
    baseURL,
  }) => {
    const seller = await createSeller();
    // The seller has an open session in another context.
    const sellerContext = await browser.newContext({ baseURL });
    await signIn(sellerContext, { email: seller.email, password: seller.password }, baseURL);
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto('/inicio');
    await expect(sellerPage).toHaveURL(/\/inicio$/);

    const row = await openRow(page, seller.orgName);
    await row.getByRole('button', { name: /Suspender/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /Motivo/ }).fill('     ');
    await dialog.getByRole('button', { name: 'Suspender' }).click();
    await expect(dialog.getByText('Escribe el motivo de la suspensión.')).toBeVisible();

    await dialog.getByRole('textbox', { name: /Motivo/ }).fill('Prueba de suspensión e2e');
    await expect(dialog.getByText('24 de 500 caracteres')).toBeVisible();
    await dialog.getByRole('button', { name: 'Suspender' }).click();
    await expect(dialog).toBeHidden();
    const suspendedRow = page
      .locator('[data-row-key]')
      .filter({ visible: true })
      .filter({ hasText: seller.orgName });
    await expect(suspendedRow).toContainText('Suspendida');
    await expect(suspendedRow).toContainText('Motivo: Prueba de suspensión e2e');

    await sellerPage.goto('/inicio');
    await expect(sellerPage).toHaveURL(/\/acceso-suspendido$/);

    await suspendedRow.getByRole('button', { name: /Reactivar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByText(`Reactivamos ${seller.orgName}.`)).toBeVisible();
    await expect(
      page.locator('[data-row-key]').filter({ visible: true }).filter({ hasText: seller.orgName }),
    ).toContainText('Activa');

    await sellerPage.goto('/inicio');
    await expect(sellerPage).toHaveURL(/\/inicio$/);
    await sellerContext.close();

    const actions = (await auditEventsFor(seller.orgId)).map((e) => e.action);
    expect(actions.filter((a) => a === 'organization.suspended')).toHaveLength(1);
    expect(actions.filter((a) => a === 'organization.reactivated')).toHaveLength(1);
  });

  test('accesibilidad del listado y del diálogo de suspensión (axe)', async ({ page }) => {
    const seller = await createSeller();
    const row = await openRow(page, seller.orgName);
    await expectNoA11yViolations(page);
    await row.getByRole('button', { name: /Suspender/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test('un vendedor recibe "sin permiso" en organizaciones y consumo', async ({ page, loginAs }) => {
  await loginAs('vendedorA');
  for (const path of ['/admin/organizaciones', '/admin/consumo']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(403);
  }
});
