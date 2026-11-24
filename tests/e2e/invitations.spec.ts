import { createHash, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { formatDateTime } from '../../src/lib/format';
import { expectNoA11yViolations } from './fixtures/axe';
import {
  adminClient,
  auditEventsFor,
  createInvitation,
  createSuperadmin,
  uniqueEmail,
} from './fixtures/factories';
import { countMessagesTo, findLink, latestMessageTo } from './fixtures/mailpit';
import { expect, test } from './fixtures/test';

/**
 * US1 (FR-009, FR-010, FR-013, FR-036). Unique emails per test; rows are always located by searching
 * the test's unique email, never by position. Never uses seeded invitations.
 */

async function createViaUi(page: Page, email: string, days?: string) {
  await page.goto('/admin/invitaciones/nueva');
  await page.locator('input[name="email"]').fill(email);
  if (days) await page.locator('input[name="expiresInDays"]').fill(days);
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
}

function rowFor(page: Page, email: string) {
  return page.locator('[data-row-key]').filter({ visible: true }).filter({ hasText: email });
}

async function openRow(page: Page, email: string) {
  await page.goto(`/admin/invitaciones?q=${encodeURIComponent(email)}`);
  const row = rowFor(page, email);
  await expect(row).toHaveCount(1);
  return row;
}

function tokenOf(link: string): string {
  return new URL(link).pathname.split('/').pop()!;
}

async function invitationByEmail(email: string) {
  const { data } = await adminClient()
    .from('invitations')
    .select('*')
    .eq('email', email.toLowerCase());
  return data ?? [];
}

const sha256Hex = (value: string) => `\\x${createHash('sha256').update(value).digest('hex')}`;

test.describe('US1 · invitaciones', () => {
  // A fresh superadmin per test: concurrent TOTP verifications on the shared seed factor collide.
  test.beforeEach(async ({ loginAs }) => {
    const admin = await createSuperadmin();
    await loginAs({
      email: admin.email,
      password: admin.password,
      totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
    });
  });

  test('crear con el plazo por defecto envía el correo y la fila queda pendiente', async ({
    page,
  }) => {
    const email = uniqueEmail('invitado');
    await createViaUi(page, email);
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
    await expect(page.getByText('Invitación enviada.')).toBeVisible();

    const message = await latestMessageTo(email);
    expect(message.subject).toBe('Te invitamos a Creando Valor IA™');
    expect(message.html).toContain('Activar mi cuenta');
    expect(message.text).toContain('(7 días)');
    const token = tokenOf(findLink(message, /\/invitacion\//));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const row = await openRow(page, email);
    await expect(row).toContainText('Pendiente');
    const [invitation] = await invitationByEmail(email);
    expect(invitation!.token_hash).toBe(sha256Hex(token));
    expect(invitation!.expires_in_days).toBe(7);
    const created = (await auditEventsFor(invitation!.id)).filter(
      (e) => e.action === 'invitation.created',
    );
    expect(created).toHaveLength(1);
    expect(JSON.stringify(created)).not.toContain(email);
  });

  test('un duplicado (mayúsculas y espacios) se rechaza y ofrece reenviar', async ({ page }) => {
    const email = uniqueEmail('duplicado');
    await createViaUi(page, email);
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);

    await createViaUi(page, `  ${email.toUpperCase()}  `);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText('Ya hay una invitación abierta para ese correo');
    await expect(alert.getByRole('button', { name: /Reenviar/ })).toBeVisible();
    expect(await invitationByEmail(email)).toHaveLength(1);
  });

  test('reenviar invalida el enlace anterior; doble clic envía un solo correo', async ({
    page,
  }) => {
    const email = uniqueEmail('reenvio');
    await createViaUi(page, email);
    const first = await latestMessageTo(email);
    const oldToken = tokenOf(findLink(first, /\/invitacion\//));

    const row = await openRow(page, email);
    await row.getByRole('button', { name: /Reenviar/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('El enlace anterior dejará de funcionar');
    await dialog.getByRole('button', { name: 'Reenviar' }).dblclick();
    await expect(page.getByText(/Enviamos una invitación nueva/)).toBeVisible();

    await expect.poll(() => countMessagesTo(email)).toBe(2);
    await page.waitForTimeout(1_500);
    expect(await countMessagesTo(email)).toBe(2);

    const [invitation] = await invitationByEmail(email);
    const newToken = tokenOf(findLink(await latestMessageTo(email), /\/invitacion\//));
    expect(newToken).not.toBe(oldToken);
    expect(invitation!.token_hash).toBe(sha256Hex(newToken));
    expect(invitation!.token_hash).not.toBe(sha256Hex(oldToken));
    const resent = (await auditEventsFor(invitation!.id)).filter(
      (e) => e.action === 'invitation.resent',
    );
    expect(resent).toHaveLength(1);
  });

  test('revocar cambia el estado y audita una vez', async ({ page }) => {
    const email = uniqueEmail('revocar');
    await createViaUi(page, email);
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
    const row = await openRow(page, email);
    await row.getByRole('button', { name: /Revocar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revocar' }).click();
    await expect(page.getByText(`Revocamos la invitación de ${email}.`)).toBeVisible();
    await expect(rowFor(page, email)).toContainText('Revocada');
    const [invitation] = await invitationByEmail(email);
    expect(
      (await auditEventsFor(invitation!.id)).filter((e) => e.action === 'invitation.revoked'),
    ).toHaveLength(1);
  });

  test('una invitación vencida bloquea crear otra y reenviarla la vuelve pendiente', async ({
    page,
  }) => {
    const expired = await createInvitation({ state: 'expired' });
    await createViaUi(page, expired.email);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText('Ya hay una invitación abierta');
    await alert.getByRole('button', { name: /Reenviar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reenviar' }).click();
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
    const row = await openRow(page, expired.email);
    await expect(row).toContainText('Pendiente');
    await expect.poll(() => countMessagesTo(expired.email)).toBe(1);
  });

  test('el fallo de envío se avisa y permite reintentar', async ({ page }) => {
    const email = `falla+${randomUUID()}@falla-envio.test`;
    await createViaUi(page, email);
    await expect(page.getByText(/no pudimos enviar el correo/)).toBeVisible();
    const row = await openRow(page, email);
    await expect(row).toContainText('Envío fallido');
    await row.getByRole('button', { name: /Reintentar envío/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reintentar envío' }).click();
    await expect(page.getByText(/No pudimos enviar el correo/)).toBeVisible();
    const [invitation] = await invitationByEmail(email);
    expect(invitation!.send_status).toBe('failed');
    expect(invitation!.send_attempts).toBe(2);
  });

  test('un doble envío rápido del formulario crea una sola invitación y un solo correo', async ({
    page,
  }) => {
    const email = uniqueEmail('doble');
    await page.goto('/admin/invitaciones/nueva');
    await page.locator('input[name="email"]').fill(email);
    await page
      .locator('form:has(input[name="idempotencyKey"])')
      .evaluate((form: HTMLFormElement) => {
        form.requestSubmit();
        form.requestSubmit();
      });
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await expect.poll(() => countMessagesTo(email)).toBe(1);
    await page.waitForTimeout(1_500);
    expect(await countMessagesTo(email)).toBe(1);
    const invitations = await invitationByEmail(email);
    expect(invitations).toHaveLength(1);
    expect(
      (await auditEventsFor(invitations[0]!.id)).filter((e) => e.action === 'invitation.created'),
    ).toHaveLength(1);
  });

  test('accesibilidad del listado y del formulario (axe)', async ({ page }) => {
    await page.goto('/admin/invitaciones');
    await expectNoA11yViolations(page);
    await page.goto('/admin/invitaciones/nueva');
    await expectNoA11yViolations(page);
  });
});

test.describe('US1 · fechas y permisos', () => {
  test('las fechas se muestran en la zona horaria del perfil del superadmin (FR-036)', async ({
    page,
    loginAs,
  }) => {
    const admin = await createSuperadmin({ timezone: 'Asia/Tokyo' });
    await loginAs({
      email: admin.email,
      password: admin.password,
      totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
    });
    const invitation = await createInvitation({ state: 'pending' });
    const row = await openRow(page, invitation.email);
    const [stored] = await invitationByEmail(invitation.email);
    await expect(row).toContainText(formatDateTime(stored!.expires_at, 'Asia/Tokyo'));
  });

  test('un vendedor recibe "sin permiso" (403)', async ({ page, loginAs }) => {
    await loginAs('vendedorA');
    const response = await page.goto('/admin/invitaciones');
    expect(response?.status()).toBe(403);
    await expect(
      page.getByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeVisible();
  });
});
