import type { Page } from '@playwright/test';
import { formatDateTime } from '../../src/lib/format';
import { initials } from '../../src/lib/initials';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller, type CreatedSeller } from './fixtures/factories';
import { expect, test } from './fixtures/test';

/**
 * US9 (FR-035, FR-036). Saving cases use a factory seller (never the seeded ones). Lima and Bogotá
 * share UTC-5, so the "dates follow the zone" check moves to Asia/Tokyo.
 */

const ACCEPTED_AT = '2026-01-15T03:30:00Z';

async function sellerWithAcceptances(): Promise<CreatedSeller> {
  const seller = await createSeller();
  const admin = adminClient();
  const { data: docs } = await admin
    .from('legal_documents')
    .select('id, kind, effective_at')
    .in('kind', ['terms', 'ai_notice'])
    .lte('effective_at', new Date().toISOString())
    .order('effective_at', { ascending: false });
  const latest = new Map<string, string>();
  for (const doc of docs ?? []) if (!latest.has(doc.kind)) latest.set(doc.kind, doc.id);
  expect(latest.size).toBe(2);
  const { error } = await admin.from('legal_acceptances').insert(
    [...latest.values()].map((document_id) => ({
      user_id: seller.id,
      document_id,
      accepted_at: ACCEPTED_AT,
    })),
  );
  expect(error).toBeNull();
  return seller;
}

async function signInAs(
  page: Page,
  loginAs: (u: { email: string; password: string }) => Promise<void>,
  seller: CreatedSeller,
) {
  await loginAs({ email: seller.email, password: seller.password });
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible();
}

async function chooseZone(page: Page, search: string, zone: string) {
  await page.getByRole('combobox', { name: /Zona horaria/ }).click();
  await page.getByRole('combobox', { name: 'Buscar zona o ciudad' }).fill(search);
  await page.getByRole('option', { name: zone.replaceAll('_', ' '), exact: true }).click();
  await expect(page.getByRole('combobox', { name: /Zona horaria/ })).toHaveText(
    zone.replaceAll('_', ' '),
  );
}

test.describe('US9 · perfil', () => {
  test('guarda nombre y zona; avatar y fechas cambian', async ({ page, loginAs }) => {
    const seller = await sellerWithAcceptances();
    await signInAs(page, loginAs, seller);
    await expect(page.getByTestId('accepted-terms')).toContainText(
      formatDateTime(ACCEPTED_AT, 'America/Lima'),
    );

    const newName = 'Ñandú Pruebas';
    await page.getByRole('textbox', { name: /Nombre/ }).fill(newName);
    await chooseZone(page, 'bogota', 'America/Bogota');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Guardamos tu perfil.')).toBeVisible();

    const { data: profile } = await adminClient()
      .from('profiles')
      .select('full_name, timezone')
      .eq('user_id', seller.id)
      .single();
    expect(profile).toEqual({ full_name: newName, timezone: 'America/Bogota' });
    const { data: org } = await adminClient()
      .from('organizations')
      .select('name, timezone')
      .eq('id', seller.orgId)
      .single();
    expect(org).toEqual({ name: newName, timezone: 'America/Bogota' });

    // Initials in the top bar (account menu) and in the menu header.
    const menu = page.getByRole('button', { name: 'Menú de cuenta' });
    await expect(menu).toContainText(initials(newName));
    await menu.click();
    await expect(page.getByRole('menu')).toContainText(newName);
    await page.keyboard.press('Escape');

    // Dates follow the new zone (FR-036).
    await chooseZone(page, 'tokyo', 'Asia/Tokyo');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByTestId('accepted-terms')).toContainText(
      formatDateTime(ACCEPTED_AT, 'Asia/Tokyo'),
    );
    await expect(page.getByTestId('accepted-ai_notice')).toContainText(
      formatDateTime(ACCEPTED_AT, 'Asia/Tokyo'),
    );
  });

  test('nombre vacío o de más de 80 caracteres: error junto al campo', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    await signInAs(page, loginAs, seller);
    const name = page.getByRole('textbox', { name: /Nombre/ });
    await name.fill('   ');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');

    await name.fill('x'.repeat(81));
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Tu nombre puede tener hasta 80 caracteres.')).toBeVisible();
    await expect(name).toHaveValue('x'.repeat(81));
    const { data } = await adminClient()
      .from('profiles')
      .select('full_name')
      .eq('user_id', seller.id)
      .single();
    expect(data?.full_name).toBe(seller.fullName);
  });

  test('correo y aceptaciones en solo lectura', async ({ page, loginAs }) => {
    const seller = await sellerWithAcceptances();
    await signInAs(page, loginAs, seller);
    await expect(page.getByTestId('profile-email')).toHaveText(seller.email);
    await expect(page.getByRole('textbox', { name: /Correo/ })).toHaveCount(0);
    await expect(page.getByTestId('accepted-terms')).toBeVisible();
    await expect(page.getByTestId('accepted-ai_notice')).toBeVisible();
  });

  test('el combobox de zona se opera con teclado', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await signInAs(page, loginAs, seller);
    const trigger = page.getByRole('combobox', { name: /Zona horaria/ });
    await expect(trigger).toHaveText('America/Lima');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('combobox', { name: 'Buscar zona o ciudad' })).toBeFocused();
    await page.keyboard.type('Mexico City');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveText('America/Mexico City');
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('America/Mexico City');
  });

  test('con la organización suspendida y la sesión abierta, guardar se rechaza', async ({
    page,
    loginAs,
  }) => {
    // Seeded seller D cannot even open /perfil (suspended org → /acceso-suspendido); this reproduces the
    // "open session, then suspended" case with a factory seller.
    const seller = await createSeller();
    await signInAs(page, loginAs, seller);
    await adminClient()
      .from('organizations')
      .update({
        status: 'suspended',
        suspended_reason: 'e2e',
        suspended_at: new Date().toISOString(),
      })
      .eq('id', seller.orgId);
    await page.getByRole('textbox', { name: /Nombre/ }).fill('Nombre Rechazado');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Tu acceso está suspendido.')).toBeVisible();
    const { data } = await adminClient()
      .from('profiles')
      .select('full_name')
      .eq('user_id', seller.id)
      .single();
    expect(data?.full_name).toBe(seller.fullName);
  });

  test('el vendedor D sembrado (org suspendida) no llega al perfil', async ({ page, loginAs }) => {
    await loginAs('vendedorD');
    await page.goto('/perfil');
    await expect(page).toHaveURL(/\/acceso-suspendido$/);
  });

  test('accesibilidad del perfil y del combobox abierto (axe)', async ({ page, loginAs }) => {
    const seller = await sellerWithAcceptances();
    await signInAs(page, loginAs, seller);
    await expectNoA11yViolations(page);
    await page.getByRole('combobox', { name: /Zona horaria/ }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
