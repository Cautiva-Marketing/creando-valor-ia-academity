import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { adminClient, createSeller, type CreatedSeller } from './fixtures/factories';
import { createActiveSession, forceDeadline } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';
import { fillSignIn } from './support/auth-ui';

/**
 * US4 · resiliencia (scenarios 13–14, edge cases, SC-009; quickstart 8–10, 18). Every marked message
 * carries a unique tag: the fake provider counts calls per message text across tests.
 */
const tag = () => randomUUID().slice(0, 8);

async function open(
  page: Page,
  loginAs: (u: { email: string; password: string }) => Promise<void>,
  seller: CreatedSeller,
  sessionId: string,
) {
  await loginAs({ email: seller.email, password: seller.password });
  await page.goto(`/practicas/${sessionId}`);
  await expect(page.getByTestId('practice-session')).toBeVisible();
}

const composerOf = (page: Page) => page.getByRole('textbox', { name: 'Tu mensaje' });

async function sendMessage(page: Page, text: string) {
  await composerOf(page).fill(text);
  await composerOf(page).press('Enter');
}

async function messagesOf(sessionId: string) {
  const { data, error } = await adminClient()
    .from('practice_messages')
    .select('seq, author, reply_to_seq')
    .eq('session_id', sessionId)
    .order('seq');
  expect(error).toBeNull();
  return data ?? [];
}

const buyerMessages = (page: Page) =>
  page.getByRole('log').locator('[data-testid="chat-message"][data-author="buyer"]');

test.describe('US4 · resiliencia de la sesión', () => {
  test('429 del proveedor → "reintentando…" y una sola respuesta', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    await sendMessage(page, `¿Qué buscas en un lote? [[e2e:429]] ${tag()}`);
    await expect(page.getByTestId('typing')).toHaveText('El cliente está tardando, reintentando…');
    await expect(buyerMessages(page)).toHaveCount(2);
    const messages = await messagesOf(session.id);
    expect(messages.filter((m) => m.author === 'seller')).toHaveLength(1);
    expect(messages.filter((m) => m.author === 'buyer')).toHaveLength(2);
  });

  test('stream cortado → texto parcial descartado y "Reintentar" con el mismo mensaje', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    await sendMessage(page, `Cuéntame de tu familia [[e2e:cortar-stream]] ${tag()}`);
    const failed = page.getByTestId('message-failed');
    await expect(failed).toHaveText(/El cliente no pudo responder/);
    await expect(page.getByTestId('streaming-reply')).toHaveCount(0);
    await expect(buyerMessages(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(buyerMessages(page)).toHaveCount(2);
    await expect(failed).toHaveCount(0);
    const messages = await messagesOf(session.id);
    expect(messages.map((m) => m.author)).toEqual(['buyer', 'seller', 'buyer']);
    expect(messages[2]!.reply_to_seq).toBe(2);
  });

  test('sin red → "no enviado" sin perder el texto y reintento', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    await page.context().setOffline(true);
    await sendMessage(page, `Hola, ¿sigues ahí? ${tag()}`);
    await expect(page.getByTestId('message-failed')).toHaveText(/No se envió/);
    await expect(page.getByRole('log').getByText('Hola, ¿sigues ahí?')).toBeVisible();
    expect(await messagesOf(session.id)).toHaveLength(1);

    await page.context().setOffline(false);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(buyerMessages(page)).toHaveCount(2);
    expect(await messagesOf(session.id)).toHaveLength(3);
  });

  test('doble Enviar → un solo mensaje', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    await composerOf(page).fill(`Doble clic ${tag()}`);
    // Two clicks in the same task, before React can disable the button: the busy guard must hold.
    await page.getByRole('button', { name: 'Enviar' }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(buyerMessages(page)).toHaveCount(2);
    expect((await messagesOf(session.id)).filter((m) => m.author === 'seller')).toHaveLength(1);
  });

  test('dos pestañas: la segunda no puede enviar mientras el cliente responde', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);
    const second = await page.context().newPage();
    await second.goto(`/practicas/${session.id}`);
    await expect(second.getByTestId('practice-session')).toBeVisible();

    // Two 429 retries (1 s + 3 s) keep the first turn busy long enough, even under parallel load.
    await sendMessage(page, `Primera pestaña [[e2e:429:2]] ${tag()}`);
    await expect(page.getByTestId('typing')).not.toHaveText('');
    await sendMessage(second, `Segunda pestaña ${tag()}`);
    await expect(
      second.getByText('Espera la respuesta del cliente antes de enviar otro mensaje.'),
    ).toBeVisible();

    await expect(buyerMessages(page)).toHaveCount(2);
    expect((await messagesOf(session.id)).filter((m) => m.author === 'seller')).toHaveLength(1);
  });

  test('cerrar la pestaña y retomar desde Hoy con transcripción, panel y borrador', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, { sellerMessages: 2 });
    await open(page, loginAs, seller, session.id);
    await composerOf(page).fill('Borrador sin enviar');

    await page.goto('/inicio');
    const card = page.getByTestId('ongoing-practice');
    await expect(card).toContainText('Tienes una práctica en curso');
    await card.getByRole('link', { name: 'Retomar' }).click();
    await expect(page.getByTestId('practice-session')).toBeVisible();
    await expect(page.getByRole('log').getByTestId('chat-message')).toHaveCount(5);
    await expect(composerOf(page)).toHaveValue('Borrador sin enviar');
  });

  test('sesión de autenticación expirada al enviar → iniciar sesión y volver con el borrador', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    await page.context().clearCookies();
    await sendMessage(page, 'Mensaje tras expirar la sesión');
    await expect(page).toHaveURL(
      new RegExp(`/iniciar-sesion\\?next=${encodeURIComponent(`/practicas/${session.id}`)}`),
    );
    await fillSignIn(page, seller.email, seller.password);
    await expect(page).toHaveURL(new RegExp(`/practicas/${session.id}$`));
    await expect(page.getByTestId('practice-session')).toBeVisible();
    await expect(composerOf(page)).toHaveValue('Mensaje tras expirar la sesión');
    expect(await messagesOf(session.id)).toHaveLength(1);
  });

  test('tiempo agotado: en ≤ 1 minuto la sesión se cierra sin abrir la página', async () => {
    test.setTimeout(120_000);
    const seller = await createSeller();
    const session = await createActiveSession(seller, { sellerMessages: 1 });
    await forceDeadline(session.id);
    await expect
      .poll(
        async () => {
          const { data } = await adminClient()
            .from('practice_sessions')
            .select('status, end_reason')
            .eq('id', session.id)
            .single();
          // Closed by time; the dispatcher may already have evaluated it.
          return data?.status === 'active' ? null : data;
        },
        { timeout: 75_000, intervals: [2_000] },
      )
      .toEqual({
        status: expect.stringMatching(/^(finalized|evaluated)$/),
        end_reason: 'time_limit',
      });
  });
});
