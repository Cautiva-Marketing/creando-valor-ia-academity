import { randomBytes, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import {
  adminClient,
  auditEventsFor,
  createInvitation,
  FACTORY_PASSWORD,
} from './fixtures/factories';
import { fixedClientIp, ipHeaders } from './fixtures/network';
import { expect, test } from './fixtures/test';

/**
 * US2 (FR-011, FR-012, FR-014–017, AC-02). Every case uses invitations created by the factory in the
 * state it needs; never the seeded ones. Runs at 360 px and desktop (Playwright projects).
 */

const PASSWORD = 'Activar-Segura-2026!';

async function fillActivation(
  page: Page,
  { name = 'Ana Prueba', password = PASSWORD, terms = true, ai = true } = {},
) {
  await page.locator('input[name="fullName"]').fill(name);
  await page.locator('input[name="password"]').fill(password);
  if (terms) await page.getByRole('checkbox', { name: /términos de uso/ }).check();
  if (ai) await page.getByRole('checkbox', { name: /aviso de uso de IA/ }).check();
}

const submit = (page: Page) => page.getByRole('button', { name: 'Activar mi cuenta' });

async function usersWithEmail(email: string) {
  const { data } = await adminClient().from('profiles').select('user_id').eq('email', email);
  return data ?? [];
}

async function membershipsOf(userId: string) {
  const { data } = await adminClient()
    .from('memberships')
    .select(
      'roles, status, organization_id, organizations(type, status, name, timezone, quotas(daily_limit, monthly_limit))',
    )
    .eq('user_id', userId);
  return data ?? [];
}

const randomToken = () => randomBytes(32).toString('base64url');

test.describe('US2 · activación de cuenta', () => {
  test('activa la cuenta y entra al onboarding con su organización personal', async ({ page }) => {
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    const email = page.locator('input[name="username"]');
    await expect(email).toHaveValue(invitation.email);
    await expect(email).toHaveAttribute('readonly', '');
    const name = `Ñandú Pérez ${randomBytes(3).toString('hex')}`;
    await fillActivation(page, { name });
    await submit(page).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ñandú');

    const [user] = await usersWithEmail(invitation.email);
    const memberships = await membershipsOf(user!.user_id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      roles: ['vendedor'],
      status: 'active',
      organizations: {
        type: 'personal',
        status: 'active',
        name,
        timezone: 'America/Lima',
        quotas: { daily_limit: 10, monthly_limit: 100 },
      },
    });
    const accepted = (await auditEventsFor(invitation.id)).filter(
      (e) => e.action === 'invitation.accepted',
    );
    expect(accepted).toHaveLength(1);
  });

  test('una contraseña débil muestra el requisito sin perder lo escrito', async ({ page }) => {
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    await fillActivation(page, { name: 'Bruno Débil', password: 'corta' });
    await expect(page.locator('#requisitos-contrasena')).toContainText('10');
    await submit(page).click();
    await expect(page.locator('#password-error')).toBeVisible();
    await expect(page.locator('input[name="fullName"]')).toHaveValue('Bruno Débil');
    await expect(page.locator('input[name="password"]')).toHaveValue('corta');
    expect(await usersWithEmail(invitation.email)).toHaveLength(0);
  });

  test('sin aceptar las casillas no continúa', async ({ page }) => {
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    await fillActivation(page, { terms: false, ai: false });
    await submit(page).click();
    await expect(page.getByText('Debes aceptar los términos y condiciones.')).toBeVisible();
    await expect(page.getByText('Debes aceptar el aviso de uso de IA.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/invitacion/${invitation.token}$`));
    expect(await usersWithEmail(invitation.email)).toHaveLength(0);
  });

  test('una invitación ya usada ofrece iniciar sesión', async ({ page }) => {
    const invitation = await createInvitation({ state: 'accepted' });
    await page.goto(`/invitacion/${invitation.token}`);
    await expect(page.getByRole('heading', { name: 'Esta invitación ya fue usada' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
  });

  for (const [state, title] of [
    ['expired', 'Esta invitación venció'],
    ['revoked', 'Esta invitación fue revocada'],
  ] as const) {
    test(`una invitación ${state} muestra el mensaje AC-02`, async ({ page }) => {
      const invitation = await createInvitation({ state });
      await page.goto(`/invitacion/${invitation.token}`);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.locator('input[name="password"]')).toHaveCount(0);
    });
  }

  test('un enlace manipulado o inexistente muestra el mensaje genérico', async ({ page }) => {
    for (const token of ['abc', `${randomToken()}x`, randomToken()]) {
      await page.goto(`/invitacion/${token}`);
      await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible();
    }
  });

  test('un doble clic crea una sola cuenta', async ({ page }) => {
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    await fillActivation(page);
    await submit(page).dblclick();
    await expect(page).toHaveURL(/\/onboarding$/);
    const users = await usersWithEmail(invitation.email);
    expect(users).toHaveLength(1);
    expect(await membershipsOf(users[0]!.user_id)).toHaveLength(1);
    expect(
      (await auditEventsFor(invitation.id)).filter((e) => e.action === 'invitation.accepted'),
    ).toHaveLength(1);
  });

  test('reutiliza una cuenta huérfana con el correo de la invitación', async ({ page }) => {
    const invitation = await createInvitation();
    const { data, error } = await adminClient().auth.admin.createUser({
      email: invitation.email,
      password: FACTORY_PASSWORD,
      email_confirm: true,
    });
    expect(error).toBeNull();
    await page.goto(`/invitacion/${invitation.token}`);
    await fillActivation(page);
    await submit(page).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    const users = await usersWithEmail(invitation.email);
    expect(users).toHaveLength(1);
    expect(users[0]!.user_id).toBe(data.user!.id);
    expect(await membershipsOf(data.user!.id)).toHaveLength(1);
  });

  test('una versión legal alterada pide aceptar de nuevo sin crear la cuenta', async ({ page }) => {
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    await fillActivation(page, { name: 'Carla Legal' });
    // Tamper after the last re-render so React does not restore the server-rendered value.
    await page.locator('input[name="termsDocumentId"]').evaluate((input: HTMLInputElement, id) => {
      input.value = id;
    }, randomUUID());
    await submit(page).click();
    await expect(page.getByText(/se actualizaron: revísalos y acéptalos de nuevo/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /términos de uso/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /aviso de uso de IA/ })).not.toBeChecked();
    await expect(page.locator('input[name="fullName"]')).toHaveValue('Carla Legal');
    expect(await usersWithEmail(invitation.email)).toHaveLength(0);
  });

  test('el 11.º intento de activación desde la misma IP en una hora se frena', async ({
    page,
  }, testInfo) => {
    test.slow();
    await page.context().setExtraHTTPHeaders(ipHeaders(fixedClientIp(testInfo)));
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    await fillActivation(page, { terms: false, ai: false });
    for (let attempt = 1; attempt <= 10; attempt++) {
      await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().includes('/invitacion/'),
        ),
        submit(page).click(),
      ]);
      await expect(page.getByText('Debes aceptar los términos y condiciones.')).toBeVisible();
    }
    await submit(page).click();
    await expect(
      page.getByText(/Demasiados intentos\. Vuelve a intentarlo en \d+ minutos?/),
    ).toBeVisible();
    expect(await usersWithEmail(invitation.email)).toHaveLength(0);
  });

  test('abrir repetidamente enlaces inexistentes desde la misma IP se frena', async ({
    page,
  }, testInfo) => {
    test.slow();
    await page.context().setExtraHTTPHeaders(ipHeaders(fixedClientIp(testInfo)));
    for (let attempt = 1; attempt <= 10; attempt++) {
      await page.goto(`/invitacion/${randomToken()}`);
      await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible();
    }
    await page.goto(`/invitacion/${randomToken()}`);
    await expect(page.getByRole('heading', { name: 'Demasiados intentos' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(/Vuelve a intentarlo en \d+ minutos?/);
  });

  test('accesibilidad del formulario y de los mensajes (axe)', async ({ page }) => {
    const invitation = await createInvitation();
    await page.goto(`/invitacion/${invitation.token}`);
    await expectNoA11yViolations(page);
    await page.goto(`/invitacion/${randomToken()}`);
    await expectNoA11yViolations(page);
    await page.goto('/terminos');
    await expectNoA11yViolations(page);
    await page.goto('/aviso-ia');
    await expectNoA11yViolations(page);
  });
});
