import { expectNoA11yViolations } from './fixtures/axe';
import { createSuperadmin } from './fixtures/factories';
import { expect, test } from './fixtures/test';

/** FR-039, FR-040: friendly 404 and unexpected-error states, never internal details. */

const INTERNAL_DETAILS =
  /admin_list_organizations|22003|out of range|stack|at Object\.|node_modules|\.tsx?:\d+|PGRST/i;

test('404 con marca, mensaje claro y camino de regreso', async ({ page }) => {
  const response = await page.goto('/esta-pagina-no-existe');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'No encontramos esta página', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Creando Valor IA™').first()).toBeVisible();
  const back = page.getByRole('link', { name: 'Volver al inicio' });
  await expect(back).toHaveAttribute('href', '/');
  await back.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practica la venta');
});

test('accesibilidad de la página 404 (axe)', async ({ page }) => {
  await page.goto('/esta-pagina-no-existe');
  await expectNoA11yViolations(page);
});

test('un error inesperado muestra "Reintentar" y una referencia, sin detalles internos', async ({
  page,
  loginAs,
}) => {
  const admin = await createSuperadmin();
  await loginAs({
    email: admin.email,
    password: admin.password,
    totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
  });
  // A page number whose offset overflows Postgres `int`: the RPC fails and the segment error boundary
  // takes over, as any unexpected server error would.
  await page.goto('/admin/organizaciones?pagina=200000000');
  const alert = page.getByRole('alert').filter({ hasText: 'No pudimos cargar las organizaciones' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/Referencia: \S+/);
  await expect(alert.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(INTERNAL_DETAILS);
  // The app shell stays usable around the error.
  await expect(page.getByRole('button', { name: 'Menú de cuenta' })).toBeVisible();
  await expectNoA11yViolations(page);

  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No pudimos cargar las organizaciones' }),
  ).toBeVisible();
});
