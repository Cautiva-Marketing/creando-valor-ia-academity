import { expectNoA11yViolations } from './fixtures/axe';
import { createSeller, uniqueEmail } from './fixtures/factories';
import { fixedClientIp, ipHeaders } from './fixtures/network';
import { SEED_PASSWORD, SEED_USERS } from './fixtures/seed-data';
import { expect, test } from './fixtures/test';
import { fillSignIn, signInViaUi } from './support/auth-ui';

const GENERIC_ERROR = 'Correo o contraseña incorrectos.';

test.describe('US3 · inicio y cierre de sesión', () => {
  test('el vendedor A sembrado entra y llega a /inicio', async ({ page }) => {
    await signInViaUi(page, SEED_USERS.vendedorA.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeVisible();
  });

  test('el error es genérico e idéntico para correo inexistente y contraseña errónea', async ({
    page,
  }) => {
    const seller = await createSeller();
    await signInViaUi(page, uniqueEmail('inexistente'), 'Cualquier-Clave-1');
    const unknown = await page.getByRole('main').getByRole('alert').textContent();
    await signInViaUi(page, seller.email, 'Clave-Equivocada-1');
    const wrong = await page.getByRole('main').getByRole('alert').textContent();
    expect(unknown).toBe(GENERIC_ERROR);
    expect(wrong).toBe(GENERIC_ERROR);
    await expect(page.locator('input[name="email"]')).toHaveValue(seller.email);
  });

  test('la sesión persiste al reabrir el navegador y termina al cerrar sesión', async ({
    page,
    browser,
    baseURL,
  }) => {
    const seller = await createSeller();
    await signInViaUi(page, seller.email, seller.password);
    await expect(page).toHaveURL(/\/inicio$/);

    const state = await page.context().storageState();
    const reopened = await browser.newContext({ storageState: state, baseURL });
    const again = await reopened.newPage();
    await again.goto('/inicio');
    await expect(again).toHaveURL(/\/inicio$/);
    await reopened.close();

    await page.getByRole('button', { name: 'Menú de cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/iniciar-sesion\?next=%2Finicio/);
  });

  test('5 fallos seguidos bloquean la cuenta e indican los minutos de reintento', async ({
    page,
  }) => {
    const seller = await createSeller();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await signInViaUi(page, seller.email, `Clave-Equivocada-${attempt}`);
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(GENERIC_ERROR);
    }
    await signInViaUi(page, seller.email, seller.password);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      /Demasiados intentos\. Vuelve a intentarlo en 15 minutos\./,
    );
    await expect(page).toHaveURL(/\/iniciar-sesion/);
  });

  test('20 fallos desde la misma IP frenan el 21.º intento', async ({ page }, testInfo) => {
    test.slow();
    await page.context().setExtraHTTPHeaders(ipHeaders(fixedClientIp(testInfo)));
    // A fresh page per attempt, so each assertion waits for its own submission.
    for (let attempt = 1; attempt <= 20; attempt++) {
      await signInViaUi(page, uniqueEmail('ip'), 'Clave-Equivocada-1');
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(GENERIC_ERROR);
    }
    await signInViaUi(page, uniqueEmail('ip'), 'Clave-Equivocada-1');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(/Demasiados intentos/);
  });

  test('un next externo se ignora', async ({ page }) => {
    const seller = await createSeller();
    await page.goto('/iniciar-sesion?next=https%3A%2F%2Fevil.example');
    await fillSignIn(page, seller.email, seller.password);
    await expect(page).toHaveURL(/localhost:\d+\/inicio$|127\.0\.0\.1:\d+\/inicio$/);
  });

  test('una ruta privada sin sesión vuelve a next tras iniciar sesión', async ({ page }) => {
    const seller = await createSeller();
    await signInViaUi(page, seller.email, seller.password);
    await expect(page).toHaveURL(/\/inicio$/);
    await page.context().clearCookies();
    await page.goto('/inicio?desde=correo');
    await expect(page).toHaveURL(/\/iniciar-sesion\?next=%2Finicio%3Fdesde%3Dcorreo/);
    await fillSignIn(page, seller.email, seller.password);
    await expect(page).toHaveURL(/\/inicio\?desde=correo$/);
  });

  test('vendedor D (organización suspendida) va a /acceso-suspendido', async ({ page }) => {
    await signInViaUi(page, SEED_USERS.vendedorD.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/acceso-suspendido$/);
    await expect(page.getByRole('heading', { name: 'Tu acceso está suspendido' })).toBeVisible();
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/acceso-suspendido$/);
  });

  test('vendedor E (pertenencia suspendida) va a /acceso-suspendido', async ({ page }) => {
    await signInViaUi(page, SEED_USERS.vendedorE.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/acceso-suspendido$/);
    await expect(page.getByRole('link', { name: /@/ })).toBeVisible();
  });

  test('accesibilidad de /iniciar-sesion (axe)', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await expectNoA11yViolations(page);
    await fillSignIn(page, uniqueEmail('axe'), 'Clave-Equivocada-1');
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
