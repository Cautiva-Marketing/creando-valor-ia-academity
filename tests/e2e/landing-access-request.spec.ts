import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import {
  adminClient,
  auditEventsFor,
  createAccessRequest,
  createSuperadmin,
} from './fixtures/factories';
import { fixedClientIp, ipHeaders } from './fixtures/network';
import { expect, test } from './fixtures/test';

/**
 * US10 (FR-046–049a). Each case uses unique emails and its own client IP (base fixture); the rate-limit
 * case pins a fixed IP. Requests that get converted, discarded or anonymized come from the factory.
 * The `@global` cases (inbox counter) run serially in the `global` project.
 */

const MIN_FILL_MS = 3_100;
const uniqueEmail = () => `solicitud+${randomUUID()}@ejemplo.test`;

async function openForm(page: Page) {
  await page.goto('/solicitar-acceso');
  await expect(page.getByRole('heading', { name: 'Solicitar acceso', level: 1 })).toBeVisible();
  return Date.now();
}

async function fillForm(
  page: Page,
  data: { fullName?: string; email?: string; company?: string; message?: string; accept?: boolean },
) {
  await page.getByRole('textbox', { name: /^Nombre/ }).fill(data.fullName ?? 'Nadia Prueba');
  await page
    .getByRole('textbox', { name: /^Correo electrónico/ })
    .fill(data.email ?? uniqueEmail());
  if (data.company !== undefined)
    await page.getByRole('textbox', { name: /^Empresa o cargo/ }).fill(data.company);
  if (data.message !== undefined)
    await page.getByRole('textbox', { name: /^¿Qué te gustaría practicar\?/ }).fill(data.message);
  if (data.accept ?? true)
    await page.getByRole('checkbox', { name: /política de privacidad/ }).check();
}

/** The server rejects forms sent less than 3 s after they were shown. */
async function submit(page: Page, shownAt: number) {
  const wait = MIN_FILL_MS - (Date.now() - shownAt);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
}

async function requestsFor(email: string) {
  const { data } = await adminClient()
    .from('access_requests')
    .select('id, status, privacy_document_id')
    .eq('email', email);
  return data ?? [];
}

const confirmation = (page: Page) => page.getByRole('heading', { name: 'Recibimos tu solicitud' });

test.describe('US10 · landing y solicitud de acceso', () => {
  test('la landing muestra propuesta, cómo funciona, aviso IA, CTAs y enlaces legales', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Practica la venta antes de hacerla de verdad', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cómo funciona' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Uso responsable de la IA' })).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Solicitar acceso' }).first(),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toBeVisible();
    const legal = page.getByRole('navigation', { name: 'Enlaces legales' });
    for (const [name, href] of [
      ['Términos de uso', '/terminos'],
      ['Política de privacidad', '/privacidad'],
      ['Aviso de uso de IA', '/aviso-ia'],
    ] as const) {
      await expect(legal.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    await page.getByRole('main').getByRole('link', { name: 'Solicitar acceso' }).first().click();
    await expect(page).toHaveURL(/\/solicitar-acceso$/);
    await expectNoA11yViolations(page);
  });

  test('la página de privacidad muestra la versión vigente', async ({ page }) => {
    await page.goto('/privacidad');
    await expect(
      page.getByRole('heading', { name: 'Política de privacidad', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/Versión .* vigente desde/)).toBeVisible();
  });

  test('envío válido: confirmación y fila nueva con la versión de privacidad', async ({ page }) => {
    const email = uniqueEmail();
    const shownAt = await openForm(page);
    await fillForm(page, {
      email,
      company: 'Inmobiliaria Sur',
      message: 'Quiero practicar cierres.',
    });
    await expect(page.getByText('25 de 500 caracteres')).toBeVisible();
    await submit(page, shownAt);
    await expect(confirmation(page)).toBeVisible();
    const rows = await requestsFor(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('new');
    await expect(page.locator('html')).not.toHaveCSS('overflow-x', 'scroll');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('los errores aparecen junto al campo sin perder lo escrito', async ({ page }) => {
    const shownAt = await openForm(page);
    await fillForm(page, {
      fullName: 'Nadia Error',
      email: 'no-es-correo',
      company: 'Mi empresa',
      accept: false,
    });
    await submit(page, shownAt);
    await expect(
      page.getByText('Escribe un correo válido, por ejemplo nombre@empresa.com.'),
    ).toBeVisible();
    await expect(page.getByText('Acepta la política de privacidad para continuar.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Nadia Error');
    await expect(page.getByRole('textbox', { name: /^Empresa o cargo/ })).toHaveValue('Mi empresa');
    await expect(page.getByRole('textbox', { name: /^Correo electrónico/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('una versión de privacidad alterada pide aceptar de nuevo sin perder lo escrito ni crear fila', async ({
    page,
  }) => {
    const email = uniqueEmail();
    const shownAt = await openForm(page);
    await fillForm(page, { email, fullName: 'Nadia Política' });
    await page.locator('input[name="privacyDocumentId"]').evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, randomUUID());
    await submit(page, shownAt);
    await expect(
      page.getByText('La política de privacidad se actualizó: revísala y acéptala de nuevo.'),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Nadia Política');
    await expect(page.getByRole('textbox', { name: /^Correo electrónico/ })).toHaveValue(email);
    await expect(page.getByRole('checkbox', { name: /política de privacidad/ })).not.toBeChecked();
    expect(await requestsFor(email)).toHaveLength(0);
  });

  test('un duplicado muestra la misma confirmación sin crear otra fila', async ({ page }) => {
    const email = uniqueEmail();
    for (let i = 0; i < 2; i++) {
      const shownAt = await openForm(page);
      await fillForm(page, { email: email.toUpperCase() });
      await submit(page, shownAt);
      await expect(confirmation(page)).toBeVisible();
    }
    expect(await requestsFor(email)).toHaveLength(1);
  });

  test('el 4.º envío en una hora desde la misma IP se frena', async ({ page }, testInfo) => {
    test.slow();
    await page.context().setExtraHTTPHeaders(ipHeaders(fixedClientIp(testInfo)));
    for (let i = 0; i < 3; i++) {
      const shownAt = await openForm(page);
      await fillForm(page, {});
      await submit(page, shownAt);
      await expect(confirmation(page)).toBeVisible();
    }
    const email = uniqueEmail();
    const shownAt = await openForm(page);
    await fillForm(page, { email, fullName: 'Nadia Frenada' });
    await submit(page, shownAt);
    await expect(page.getByText(/Demasiados intentos/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Nadia Frenada');
    expect(await requestsFor(email)).toHaveLength(0);
  });

  test('un envío demasiado rápido se rechaza y el honeypot no guarda nada', async ({ page }) => {
    const fastEmail = uniqueEmail();
    await openForm(page);
    await fillForm(page, { email: fastEmail });
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(
      page.getByText('Revisa tus datos un momento y vuelve a enviar la solicitud.'),
    ).toBeVisible();
    expect(await requestsFor(fastEmail)).toHaveLength(0);

    const botEmail = uniqueEmail();
    const shownAt = await openForm(page);
    await fillForm(page, { email: botEmail });
    await page.locator('input[name="website"]').fill('https://spam.example');
    await submit(page, shownAt);
    await expect(confirmation(page)).toBeVisible();
    expect(await requestsFor(botEmail)).toHaveLength(0);
  });

  test('el inicio de sesión enlaza a "Solicitar acceso"', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await page.getByRole('link', { name: 'Solicitar acceso' }).click();
    await expect(page).toHaveURL(/\/solicitar-acceso$/);
  });

  test('accesibilidad del formulario con errores (axe)', async ({ page }) => {
    const shownAt = await openForm(page);
    await expectNoA11yViolations(page);
    await fillForm(page, { email: 'mal', accept: false });
    await submit(page, shownAt);
    await expect(page.getByText('Acepta la política de privacidad para continuar.')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('US10 · bandeja de solicitudes @global', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ loginAs }) => {
    const admin = await createSuperadmin();
    await loginAs({
      email: admin.email,
      password: admin.password,
      totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
    });
  });

  async function newCount(page: Page): Promise<number> {
    await page.goto('/admin/solicitudes');
    const text = (await page.getByTestId('new-requests-count').textContent()) ?? '';
    return Number(/\d+/.exec(text)?.[0] ?? Number.NaN);
  }

  async function expectBadge(page: Page, count: number) {
    const nav = page
      .getByRole('navigation', { name: /principal/i })
      .filter({ visible: true })
      .first();
    const link = nav.getByRole('link', { name: /^Solicitudes/ });
    if (count === 0) await expect(link).toHaveAccessibleName('Solicitudes');
    else
      await expect(link).toHaveAccessibleName(`Solicitudes ${count > 99 ? '99+' : count} nuevas`);
  }

  test('el contador sube en 1 al crear una solicitud y baja en 1 al descartarla', async ({
    page,
  }) => {
    const before = await newCount(page);
    const request = await createAccessRequest();
    expect(await newCount(page)).toBe(before + 1);
    await expectBadge(page, before + 1);

    const row = page.locator(`[data-row-key="${request.id}"]`).filter({ visible: true });
    await row.getByRole('button', { name: /Descartar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByText('Descartamos la solicitud.')).toBeVisible();
    await expect(page.getByTestId('new-requests-count')).toContainText(String(before));
    await expectBadge(page, before);
    const { data } = await adminClient()
      .from('access_requests')
      .select('status')
      .eq('id', request.id)
      .single();
    expect(data?.status).toBe('discarded');
    expect((await auditEventsFor(request.id)).map((e) => e.action)).toContain(
      'access_request.discarded',
    );
  });

  test('convertir precarga el correo y deja la solicitud "invitada"', async ({ page }) => {
    const request = await createAccessRequest();
    await page.goto('/admin/solicitudes?estado=new');
    const row = page.locator(`[data-row-key="${request.id}"]`).filter({ visible: true });
    await row.getByRole('link', { name: /Convertir en invitación/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/invitaciones/nueva\\?solicitud=${request.id}$`),
    );
    await expect(page.getByRole('textbox', { name: /Correo/ })).toHaveValue(request.email);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
    const { data } = await adminClient()
      .from('access_requests')
      .select('status, invitation_id')
      .eq('id', request.id)
      .single();
    expect(data?.status).toBe('invited');
    expect(data?.invitation_id).toBeTruthy();

    await page.goto('/admin/solicitudes?estado=invited');
    const invited = page.locator(`[data-row-key="${request.id}"]`).filter({ visible: true });
    await expect(invited).toContainText('Invitada');
    await expect(invited.getByRole('link', { name: /Convertir/ })).toHaveCount(0);

    // A request that is no longer convertible shows the form without preload.
    await page.goto(`/admin/invitaciones/nueva?solicitud=${request.id}`);
    await expect(page.getByText('Solicitud no disponible')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Correo/ })).toHaveValue('');
    await page.goto('/admin/invitaciones/nueva?solicitud=no-es-uuid');
    await expect(page.getByText('Solicitud no disponible')).toBeVisible();
  });

  test('una solicitud anonimizada no muestra datos ni acciones', async ({ page }) => {
    const request = await createAccessRequest({ state: 'discarded' });
    await adminClient()
      .from('access_requests')
      .update({
        full_name: null,
        email: null,
        company_or_role: null,
        message: null,
        anonymized_at: new Date().toISOString(),
      })
      .eq('id', request.id);
    await page.goto('/admin/solicitudes?estado=discarded');
    const row = page.locator(`[data-row-key="${request.id}"]`).filter({ visible: true });
    await expect(row).toContainText('Datos eliminados');
    await expect(row).not.toContainText(request.email);
    await expect(row.getByRole('link')).toHaveCount(0);
    await expect(row.getByRole('button')).toHaveCount(0);
    await expectNoA11yViolations(page);
  });
});
