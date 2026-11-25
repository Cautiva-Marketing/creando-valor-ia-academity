import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, anonClient, createSeller, type CreatedSeller } from './fixtures/factories';
import {
  createActiveSession,
  createConfiguredSession,
  createObjections,
  createProduct,
  FAKE_PERSONA,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US3 · configurar y comenzar (scenarios 1–5, 7–9; quickstart 5–6; FR-009–FR-018). The fake
 * provider always builds Rosa Quispe; `[[e2e:setup-falla]]` in the product name makes it fail.
 */

async function login(
  page: Page,
  loginAs: (u: { email: string; password: string }) => Promise<void>,
  seller: CreatedSeller,
) {
  await loginAs({ email: seller.email, password: seller.password });
}

async function sessionsOf(seller: CreatedSeller) {
  const { data, error } = await adminClient()
    .from('practice_sessions')
    .select('id, status')
    .eq('user_id', seller.id)
    .order('configured_at');
  expect(error).toBeNull();
  return data ?? [];
}

async function configure(page: Page, objections: string[]) {
  const form = page.getByRole('form', { name: 'Configurar práctica' });
  for (const text of objections) await form.getByRole('checkbox', { name: text }).check();
  await form.getByRole('button', { name: 'Preparar mi comprador' }).click();
}

test.describe('US3 · configurar práctica', () => {
  test('configura, ve la pantalla previa sin secretos y comienza una sola vez', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, { name: 'Lote Brisas del Sur' });
    await createObjections(seller, product.id, [
      { text: 'Me queda muy lejos de Lima.', category: 'logistics' },
      { text: 'No sé si los papeles están en regla.', category: 'trust' },
    ]);
    await login(page, loginAs, seller);
    await page.goto('/practicar');

    const form = page.getByRole('form', { name: 'Configurar práctica' });
    await expect(form.getByRole('switch', { name: 'Pistas durante la práctica' })).toBeChecked();
    await expect(form.getByRole('radio', { name: '3 · Cauteloso' })).toBeChecked();
    await expect(
      form.getByText(/Cauteloso: Revela datos solo ante preguntas específicas/),
    ).toBeVisible();
    await form.getByRole('radio', { name: '5 · Muy exigente' }).click();
    await expect(form.getByText(/Muy exigente: Responde breve/)).toBeVisible();
    await form.getByRole('radio', { name: '2 · Abierto' }).click();

    await configure(page, ['Me queda muy lejos de Lima.', 'No sé si los papeles están en regla.']);
    await expect(page).toHaveURL(/\/practicas\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Tu práctica está lista' })).toBeVisible();
    await expect(page.getByTestId('buyer-name')).toContainText(`${FAKE_PERSONA.name}, 42 años`);
    await expect(page.getByTestId('quota-summary')).toContainText('Te quedan 10 simulaciones hoy');

    // FR-014: no hidden objection, motivation or revealable values; only locked labels.
    const main = page.getByRole('main');
    await expect(main).not.toContainText(FAKE_PERSONA.motivation);
    await expect(main).not.toContainText('Antes de fin de año');
    await expect(main).not.toContainText('Decide junto con su esposo');
    await expect(main).not.toContainText(/S\/\s?\d/);
    const visible = (await page.getByTestId('visible-objection').innerText()).trim();
    const hidden = ['Me queda muy lejos de Lima.', 'No sé si los papeles están en regla.'].find(
      (t) => !visible.startsWith(t),
    )!;
    await expect(main).not.toContainText(hidden);
    for (const label of ['Presupuesto', 'Plazo', 'Quién decide']) {
      await expect(page.getByRole('list', { name: 'Datos bloqueados' })).toContainText(label);
    }

    // The secrets are not readable through PostgREST by their owner.
    const client = anonClient();
    await client.auth.signInWithPassword({ email: seller.email, password: seller.password });
    const secrets = await client.from('practice_session_secrets').select('session_id');
    expect(secrets.error).toBeNull();
    expect(secrets.data).toEqual([]);

    // Double click on "Comenzar" → one consumption and m1.
    const sessionId = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Comenzar' }).dblclick();
    await expect(page.getByTestId('practice-session')).toBeVisible();
    const admin = adminClient();
    const consumptions = await admin
      .from('simulation_consumptions')
      .select('session_id')
      .eq('session_id', sessionId);
    expect(consumptions.data).toHaveLength(1);
    const messages = await admin
      .from('practice_messages')
      .select('seq, author')
      .eq('session_id', sessionId);
    expect(messages.data).toEqual([{ seq: 1, author: 'buyer' }]);
  });

  test('producto sin objeciones: enlace para agregarlas sin perder la configuración', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, { name: 'Curso de Excel' });
    await login(page, loginAs, seller);
    await page.goto('/practicar');

    const form = page.getByRole('form', { name: 'Configurar práctica' });
    await form.getByRole('radio', { name: '4 · Exigente' }).click();
    await form.getByRole('switch', { name: 'Pistas durante la práctica' }).click();
    await expect(form.getByRole('button', { name: 'Preparar mi comprador' })).toBeDisabled();
    await form.getByRole('link', { name: 'Agregar objeciones a Curso de Excel' }).click();
    await expect(page).toHaveURL(new RegExp(`/productos/${product.id}\\?pestana=objeciones`));

    await createObjections(seller, product.id, ['No tengo tiempo para estudiar.']);
    await page.goto('/practicar');
    await expect(form.getByRole('radio', { name: '4 · Exigente' })).toBeChecked();
    await expect(
      form.getByRole('switch', { name: 'Pistas durante la práctica' }),
    ).not.toBeChecked();
    await expect(
      form.getByRole('checkbox', { name: 'No tengo tiempo para estudiar.' }),
    ).toBeVisible();
  });

  test('una nueva configuración descarta la anterior', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const product = await createProduct(seller);
    const objectionIds = await createObjections(seller, product.id, [
      'Me queda muy lejos de Lima.',
    ]);
    const previous = await createConfiguredSession(seller, { product, objectionIds });
    await login(page, loginAs, seller);
    await page.goto('/practicar');

    await expect(page.getByTestId('ongoing-practice')).toContainText(
      'Tienes una práctica lista para comenzar',
    );
    await expect(page.getByText('la anterior se descartará')).toBeVisible();
    await configure(page, ['Me queda muy lejos de Lima.']);
    await expect(page.getByRole('heading', { name: 'Tu práctica está lista' })).toBeVisible();

    const sessions = await sessionsOf(seller);
    expect(sessions.find((s) => s.id === previous.id)?.status).toBe('discarded');
    expect(sessions.filter((s) => s.status === 'configured')).toHaveLength(1);

    await page.goto(`/practicas/${previous.id}`);
    await expect(
      page.getByRole('heading', { name: 'Esta configuración ya no está disponible' }),
    ).toBeVisible();
  });

  test('con una sesión activa solo se ofrece retomarla', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const active = await createActiveSession(seller);
    await login(page, loginAs, seller);
    await page.goto('/practicar');

    await expect(page.getByTestId('ongoing-practice')).toContainText(
      'Tienes una práctica en curso',
    );
    await expect(page.getByRole('form', { name: 'Configurar práctica' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Retomar' }).click();
    await expect(page).toHaveURL(new RegExp(`/practicas/${active.id}$`));
  });

  test('si el proveedor falla se ofrece reintentar y no se crea nada', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller, { name: 'Plan Hogar [[e2e:setup-falla]]' });
    await createObjections(seller, product.id, ['Está muy caro.']);
    await login(page, loginAs, seller);
    await page.goto('/practicar');

    await configure(page, ['Está muy caro.']);
    const form = page.getByRole('form', { name: 'Configurar práctica' });
    await expect(form.getByRole('alert')).toContainText(
      'No pudimos preparar a tu comprador. Inténtalo de nuevo.',
      { timeout: 20_000 },
    );
    await expect(form.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(await sessionsOf(seller)).toEqual([]);

    const attempts = await adminClient()
      .from('practice_setup_attempts')
      .select('outcome, failure_code')
      .eq('user_id', seller.id);
    expect(attempts.data).toEqual([{ outcome: 'failure', failure_code: 'provider_unavailable' }]);
    const usage = await adminClient()
      .from('ai_usage')
      .select('task, outcome, simulation_id')
      .eq('user_id', seller.id)
      .order('attempt');
    expect(usage.data?.map((u) => u.outcome)).toEqual(['retry', 'retry', 'failure']);
    expect(usage.data?.every((u) => u.task === 'buyer_setup' && u.simulation_id === null)).toBe(
      true,
    );
  });

  test('accesible con axe y usable solo con teclado', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const product = await createProduct(seller);
    await createObjections(seller, product.id, ['Me queda muy lejos de Lima.']);
    await login(page, loginAs, seller);
    await page.goto('/practicar');
    await expectNoA11yViolations(page);

    const checkbox = page.getByRole('checkbox', { name: 'Me queda muy lejos de Lima.' });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    const submit = page.getByRole('button', { name: 'Preparar mi comprador' });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Tu práctica está lista' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
