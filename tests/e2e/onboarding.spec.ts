import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller } from './fixtures/factories';
import { expect, test } from './fixtures/test';
import { signInViaUi } from './support/auth-ui';

/**
 * US8 (FR-034). Each case uses its own seller with `onboarding_status = pending` from the factory; the
 * seeded seller C is only read.
 */

async function newSeller(page: Page) {
  const seller = await createSeller({ onboardingStatus: 'pending' });
  await signInViaUi(page, seller.email, seller.password);
  // Sign-in can be slow on a cold dev server under parallel load.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
  return seller;
}

async function profileOf(userId: string) {
  const { data } = await adminClient()
    .from('profiles')
    .select('onboarding_status, onboarding_step')
    .eq('user_id', userId)
    .single();
  return data;
}

const stepLabel = (page: Page) => page.getByText(/^Paso \d de 3$/);

test.describe('US8 · onboarding', () => {
  test('empieza en "Paso 1 de 3" y retoma en el paso alcanzado', async ({ page }) => {
    const seller = await newSeller(page);
    await expect(stepLabel(page)).toHaveText('Paso 1 de 3');
    await expect(page.getByRole('progressbar')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(stepLabel(page)).toHaveText('Paso 2 de 3');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await profileOf(seller.id)).toEqual({
      onboarding_status: 'in_progress',
      onboarding_step: 2,
    });

    await page.goto('/inicio');
    await page.goto('/onboarding');
    await expect(stepLabel(page)).toHaveText('Paso 2 de 3');
    await expect(page.getByRole('heading', { name: 'Cómo funciona la práctica' })).toBeVisible();
    await page.getByRole('button', { name: 'Anterior' }).click();
    await expect(stepLabel(page)).toHaveText('Paso 1 de 3');
  });

  test('"Saltar" lleva al inicio y no vuelve a abrirse solo; se retoma desde el inicio', async ({
    page,
  }) => {
    const seller = await newSeller(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(stepLabel(page)).toHaveText('Paso 2 de 3');
    await page.getByRole('button', { name: 'Saltar' }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    expect((await profileOf(seller.id))?.onboarding_status).toBe('skipped');

    // A new sign-in goes to /inicio, not to the onboarding.
    await page.context().clearCookies();
    await signInViaUi(page, seller.email, seller.password);
    await expect(page).toHaveURL(/\/inicio$/);

    await page.getByRole('button', { name: 'Retomar onboarding' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(stepLabel(page)).toHaveText('Paso 2 de 3');
  });

  test('se retoma desde el menú de cuenta', async ({ page }) => {
    await newSeller(page);
    await page.getByRole('button', { name: 'Saltar' }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page.getByRole('button', { name: 'Menú de cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Retomar onboarding' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(stepLabel(page)).toHaveText('Paso 1 de 3');
  });

  test('completar lleva al perfil', async ({ page }) => {
    const seller = await newSeller(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(stepLabel(page)).toHaveText('Paso 3 de 3');
    await page.getByRole('button', { name: 'Completar mi perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    expect(await profileOf(seller.id)).toEqual({
      onboarding_status: 'completed',
      onboarding_step: 3,
    });
  });

  test('se recorre con teclado y sin violaciones de axe', async ({ page }) => {
    await newSeller(page);
    await expectNoA11yViolations(page);
    const next = page.getByRole('button', { name: 'Siguiente' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(stepLabel(page)).toHaveText('Paso 2 de 3');
    await expectNoA11yViolations(page);
  });

  test('el vendedor C sembrado (pendiente) entra al onboarding', async ({ page, loginAs }) => {
    await loginAs('vendedorC');
    await page.goto('/onboarding');
    await expect(stepLabel(page)).toBeVisible();
  });
});
