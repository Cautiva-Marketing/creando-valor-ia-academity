import type { Page, TestInfo } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { createSuperadmin } from './fixtures/factories';
import { expect, test } from './fixtures/test';

/** US5 (FR-031, FR-032, FR-043): navigation by role, keyboard account menu, skip link. */

const SUPERADMIN_SECTIONS = [
  'Invitaciones',
  'Solicitudes',
  'Organizaciones',
  'Consumo',
  'Design system',
];
const isMobile = (testInfo: TestInfo) => testInfo.project.name.startsWith('mobile');

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Principal' }).filter({ visible: true });
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectTouchTargets(page: Page) {
  for (const link of await primaryNav(page).getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
}

async function loginSuperadmin(
  loginAs: (who: {
    email: string;
    password: string;
    totp: { secret: string; factorId: string };
  }) => Promise<void>,
) {
  const admin = await createSuperadmin();
  await loginAs({
    email: admin.email,
    password: admin.password,
    totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
  });
}

test.describe('US5 · app shell', () => {
  test('el vendedor ve su navegación y no las secciones de administración', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('vendedorA');
    await page.goto('/inicio');
    const nav = primaryNav(page);
    await expect(nav.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Perfil' })).toBeVisible();
    for (const section of SUPERADMIN_SECTIONS) {
      await expect(page.getByRole('link', { name: section })).toHaveCount(0);
    }
    if (isMobile(testInfo)) {
      await expect(nav).toHaveCSS('position', 'fixed');
      await expectTouchTargets(page);
    }
    await expectNoHorizontalScroll(page);
  });

  test('el superadmin ve Invitaciones, Solicitudes, Organizaciones, Consumo y Design system', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginSuperadmin(loginAs);
    await page.goto('/admin/invitaciones');
    const nav = primaryNav(page);
    for (const section of SUPERADMIN_SECTIONS) {
      await expect(nav.getByRole('link', { name: new RegExp(section) })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: /Invitaciones/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    if (isMobile(testInfo)) await expectTouchTargets(page);
    await expectNoHorizontalScroll(page);
  });

  test('"Saltar al contenido" es el primer elemento enfocable y lleva al contenido', async ({
    page,
    loginAs,
  }) => {
    await loginAs('vendedorA');
    await page.goto('/inicio');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#contenido$/);
  });

  test('el menú de cuenta funciona con teclado y Escape devuelve el foco', async ({
    page,
    loginAs,
  }) => {
    await loginAs('vendedorA');
    await page.goto('/inicio');
    const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Perfil' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Retomar onboarding' })).toBeVisible();
    await expect(menu.getByRole('menuitemradio', { name: 'Sistema' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('[role^="menuitem"]:focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('el superadmin no ve "Retomar onboarding"', async ({ page, loginAs }) => {
    await loginSuperadmin(loginAs);
    await page.goto('/admin/invitaciones');
    await page.getByRole('button', { name: 'Menú de cuenta' }).click();
    await expect(page.getByRole('menuitem', { name: 'Perfil' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Retomar onboarding' })).toHaveCount(0);
  });

  test('accesibilidad de la app shell y del menú abierto (axe)', async ({ page, loginAs }) => {
    await loginAs('vendedorA');
    await page.goto('/inicio');
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Menú de cuenta' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
