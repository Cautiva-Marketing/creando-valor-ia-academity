import type { Page } from '@playwright/test';

/** UI helpers shared by the auth specs. */
export async function fillSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

export async function signInViaUi(
  page: Page,
  email: string,
  password: string,
  next?: string,
): Promise<void> {
  await page.goto(next ? `/iniciar-sesion?next=${encodeURIComponent(next)}` : '/iniciar-sesion');
  await fillSignIn(page, email, password);
}

export async function requestReset(page: Page, email: string): Promise<void> {
  await page.goto('/recuperar-contrasena');
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await page
    .getByRole('main')
    .getByRole('status')
    .filter({ hasText: 'Revisa tu correo' })
    .waitFor();
}
