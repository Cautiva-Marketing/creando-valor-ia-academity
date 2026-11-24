import { signIn } from './fixtures/auth';
import { expectNoA11yViolations } from './fixtures/axe';
import { createSeller, uniqueEmail } from './fixtures/factories';
import { countMessagesTo, findLink, latestMessageTo } from './fixtures/mailpit';
import { expect, test } from './fixtures/test';
import { requestReset } from './support/auth-ui';

const NEW_PASSWORD = 'Nueva-Clave-Consultiva-2026';

test.describe('US3 · recuperación de contraseña', () => {
  test('la confirmación es igual para correos existentes e inexistentes y solo llega un correo', async ({
    page,
  }) => {
    const seller = await createSeller();
    const ghost = uniqueEmail('fantasma');

    await requestReset(page, seller.email);
    const existing = await page.getByRole('main').getByRole('status').textContent();
    await requestReset(page, ghost);
    const missing = await page.getByRole('main').getByRole('status').textContent();
    expect(existing).toBe(missing);

    const message = await latestMessageTo(seller.email);
    expect(message.subject).toBe('Restablece tu contraseña de Creando Valor IA™');
    expect(message.text).toContain('60 minutos');
    expect(await countMessagesTo(seller.email)).toBe(1);
    expect(await countMessagesTo(ghost)).toBe(0);
  });

  test('restablecer la contraseña cierra las demás sesiones y el enlace no se reutiliza', async ({
    page,
    browser,
    baseURL,
  }) => {
    const seller = await createSeller();
    const other = await browser.newContext({ baseURL });
    await signIn(other, seller, baseURL);
    const otherPage = await other.newPage();
    await otherPage.goto('/inicio');
    await expect(otherPage).toHaveURL(/\/inicio$/);

    await requestReset(page, seller.email);
    const link = findLink(await latestMessageTo(seller.email), /\/auth\/confirm\?/);
    expect(link).toContain('type=recovery');
    await page.goto(link);
    await expect(page).toHaveURL(/\/restablecer-contrasena$/);
    await expectNoA11yViolations(page);

    await page.locator('input[name="password"]').fill(NEW_PASSWORD);
    await expect(page.getByText('Al menos 10 caracteres')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page).toHaveURL(/\/inicio$/);

    // FR-021: the other session is closed.
    await otherPage.goto('/inicio');
    await expect(otherPage).toHaveURL(/\/iniciar-sesion/);
    await other.close();

    // The link cannot be used twice.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/recuperar-contrasena\?estado=enlace-invalido$/);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('El enlace no es válido');
    await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeVisible();
  });

  test('un enlace alterado o con parámetros inválidos ofrece pedir otro', async ({ page }) => {
    await page.goto(
      '/auth/confirm?token_hash=pkce_no-existe&type=recovery&next=/restablecer-contrasena',
    );
    await expect(page).toHaveURL(/\/recuperar-contrasena\?estado=enlace-invalido$/);
    await page.goto('/auth/confirm?token_hash=abc&type=signup');
    await expect(page).toHaveURL(/\/recuperar-contrasena\?estado=enlace-invalido$/);
    await page.goto('/auth/confirm?token_hash=abc&type=recovery&next=https%3A%2F%2Fevil.example');
    await expect(page).toHaveURL(/\/recuperar-contrasena\?estado=enlace-invalido$/);
  });

  test('3 solicitudes en una hora envían un correo cada una; la 4.ª no envía y responde igual', async ({
    page,
  }) => {
    test.slow();
    const seller = await createSeller();
    for (let n = 1; n <= 3; n++) {
      await requestReset(page, seller.email);
      await expect.poll(() => countMessagesTo(seller.email), { timeout: 15_000 }).toBe(n);
      await page.waitForTimeout(1_200); // GoTrue max_frequency (1 s) between recovery emails
    }
    await requestReset(page, seller.email);
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Si existe una cuenta con ese correo',
    );
    await page.waitForTimeout(3_000);
    expect(await countMessagesTo(seller.email)).toBe(3);
  });

  test('una sesión normal no puede abrir /restablecer-contrasena', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await loginAs(seller);
    await page.goto('/restablecer-contrasena');
    // Not a recovery session → no form; a signed-in user ends at their destination.
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('button', { name: 'Guardar contraseña' })).toHaveCount(0);
  });
});
