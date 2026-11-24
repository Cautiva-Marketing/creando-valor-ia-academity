import type { Page } from '@playwright/test';
import { accessTokenFrom, sessionCookies } from './fixtures/auth';
import { expectNoA11yViolations } from './fixtures/axe';
import { testEnv } from './fixtures/env';
import { auditEventsFor, createSuperadmin } from './fixtures/factories';
import { freshTotp, totp } from './fixtures/totp';
import { expect, test } from './fixtures/test';
import { signInViaUi } from './support/auth-ui';

/**
 * US4 (FR-023, FR-025): superadmins never reach administration without aal2. Uses factory
 * superadmins only (the seeded ones are reserved for aal2 sign-ins in other specs).
 */

async function submitCode(page: Page, code: string, button: string) {
  await page.locator('input[name="code"]').fill(code);
  await page.getByRole('button', { name: button }).click();
}

/**
 * Submits a wrong code and waits until the action has finished: the audit row is written before the
 * response, and React 19 resets the form when the action completes, so typing the next code earlier
 * could be wiped by that reset (and that attempt would be sent empty and not counted).
 */
async function submitWrongCode(page: Page, code: string, button: string) {
  await page.locator('input[name="code"]').fill(code);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/mfa/')),
    page.getByRole('button', { name: button }).click(),
  ]);
  await expect(page.getByRole('button', { name: button })).toBeEnabled();
}

async function loginEvents(
  userId: string,
  step: 'mfa_enroll' | 'mfa_verify',
  result: 'success' | 'failure',
) {
  const events = await auditEventsFor(userId);
  return events.filter(
    (e) =>
      e.action === 'superadmin.login' &&
      e.result === result &&
      (e.data as { step?: string }).step === step,
  ).length;
}

/** A 6-digit code that is NOT valid now (nor in the adjacent windows). */
function wrongCode(secret: string): string {
  const valid = new Set([-30_000, 0, 30_000].map((d) => totp(secret, Date.now() + d)));
  for (let n = 0; ; n++) {
    const candidate = String(n).padStart(6, '0');
    if (!valid.has(candidate)) return candidate;
  }
}

test.describe('US4 · superadmin solo con MFA', () => {
  test('sin factor: solo /mfa/registrar; registra TOTP y entra con aal2', async ({ page }) => {
    const admin = await createSuperadmin({ withFactor: false });
    await signInViaUi(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/mfa\/registrar$/);

    for (const path of ['/inicio', '/admin', '/admin/invitaciones', '/mfa/verificar']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/mfa\/registrar$/);
    }
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    const secret = (await page.getByTestId('totp-secret').textContent())!.replace(/\s+/g, '');
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
    await expectNoA11yViolations(page);
    await submitCode(page, await freshTotp(secret, 10_000), 'Activar verificación en dos pasos');
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);

    const events = await auditEventsFor(admin.id);
    expect(events.filter((e) => e.action === 'superadmin.mfa_enrolled')).toHaveLength(1);
    expect(await loginEvents(admin.id, 'mfa_enroll', 'success')).toBe(1);
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  test('5 códigos erróneos en el registro bloquean 15 minutos y se auditan', async ({ page }) => {
    const admin = await createSuperadmin({ withFactor: false });
    await signInViaUi(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/mfa\/registrar$/);
    const secret = (await page.getByTestId('totp-secret').textContent())!.replace(/\s+/g, '');

    for (let attempt = 1; attempt <= 5; attempt++) {
      await submitWrongCode(page, wrongCode(secret), 'Activar verificación en dos pasos');
      await expect.poll(() => loginEvents(admin.id, 'mfa_enroll', 'failure')).toBe(attempt);
    }
    await submitCode(page, await freshTotp(secret, 10_000), 'Activar verificación en dos pasos');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Demasiados intentos. Vuelve a intentarlo en 15 minutos.',
    );
    await expect(page).toHaveURL(/\/mfa\/registrar$/);
  });

  test('con factor: aal1 va a /mfa/verificar, código erróneo falla y el correcto da aal2', async ({
    page,
  }) => {
    const admin = await createSuperadmin({ withFactor: true });
    await signInViaUi(page, admin.email, admin.password, '/admin/consumo');
    await expect(page).toHaveURL(/\/mfa\/verificar\?next=%2Fadmin%2Fconsumo$/);

    for (const path of ['/admin', '/admin/invitaciones', '/inicio']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/mfa\/verificar/);
    }

    await submitWrongCode(page, wrongCode(admin.totpSecret!), 'Verificar');
    await expect(page.getByText('El código no es correcto')).toBeVisible();
    await expect.poll(() => loginEvents(admin.id, 'mfa_verify', 'failure')).toBe(1);
    await expectNoA11yViolations(page);

    await submitCode(page, await freshTotp(admin.totpSecret!, 10_000), 'Verificar');
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
    expect(await loginEvents(admin.id, 'mfa_verify', 'success')).toBe(1);
  });

  test('5 fallos en /mfa/verificar bloquean 15 minutos', async ({ page }) => {
    const admin = await createSuperadmin({ withFactor: true });
    await signInViaUi(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/mfa\/verificar$/);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await submitWrongCode(page, wrongCode(admin.totpSecret!), 'Verificar');
      await expect.poll(() => loginEvents(admin.id, 'mfa_verify', 'failure')).toBe(attempt);
    }
    await submitCode(page, await freshTotp(admin.totpSecret!, 10_000), 'Verificar');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Vuelve a intentarlo en 15 minutos',
    );
    await expect(page).toHaveURL(/\/mfa\/verificar$/);
  });

  test('con aal1 la base de datos no entrega datos de administración', async () => {
    const admin = await createSuperadmin({ withFactor: true });
    const token = accessTokenFrom(
      await sessionCookies({ email: admin.email, password: admin.password }),
    );
    const response = await fetch(
      `${testEnv('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/invitations?select=id`,
      {
        headers: {
          apikey: testEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
