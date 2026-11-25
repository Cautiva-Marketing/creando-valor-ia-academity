import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller, type CreatedSeller } from './fixtures/factories';
import { createActiveSession, FAKE_PERSONA } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US4 · sesión de práctica (scenarios 1–12; quickstart 7, 11; FR-020–FR-031). The fake buyer answers
 * deterministically (src/lib/ai/fake/buyer.ts) and obeys markers in the seller message. Every marked
 * message carries a unique tag: the fake provider counts calls per message text across tests.
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

async function sendMessage(page: Page, text: string) {
  const composer = page.getByRole('textbox', { name: 'Tu mensaje' });
  await composer.fill(text);
  await composer.press('Enter');
}

const buyerMessages = (page: Page) =>
  page.getByRole('log').locator('[data-testid="chat-message"][data-author="buyer"]');

async function sessionRow(id: string) {
  const { data, error } = await adminClient()
    .from('practice_sessions')
    .select('status, end_reason, evaluation_status, seller_message_count, hints_used, interest')
    .eq('id', id)
    .single();
  expect(error).toBeNull();
  return data!;
}

/** Desktop shows the panel; on mobile it lives in the bottom sheet opened from the summary bar. */
async function withPanel(page: Page, check: () => Promise<void>) {
  const panel = page.getByTestId('session-panel');
  if (await panel.isVisible()) {
    await check();
    return;
  }
  const trigger = page.getByRole('button', { name: 'Ver panel' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Panel de la práctica' })).toBeVisible();
  await check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Panel de la práctica' })).toBeHidden();
  await expect(trigger).toBeFocused();
}

const panelScope = (page: Page) =>
  // On mobile the aside is in the DOM but hidden: only the bottom sheet is visible.
  page
    .getByTestId('session-panel')
    .or(page.getByRole('dialog', { name: 'Panel de la práctica' }))
    .filter({ visible: true })
    .first();

test.describe('US4 · sesión de práctica', () => {
  test('conversa en streaming: mensaje propio inmediato, respuesta anunciada y termómetro', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    const log = page.getByRole('log');
    await expect(log.getByText('me queda muy lejos de Lima')).toBeVisible();

    await sendMessage(page, `Hola Rosa, ¿qué es lo más importante para ti? ${tag()}`);
    await expect(log.getByText('Hola Rosa, ¿qué es lo más importante para ti?')).toBeVisible();
    await expect(buyerMessages(page)).toHaveCount(2);
    await expect(page.getByTestId('reply-announcement')).toContainText(`${FAKE_PERSONA.name}:`);
    await expect(page.getByTestId('typing')).toHaveText('');
    await expect(page.getByRole('textbox', { name: 'Tu mensaje' })).toHaveValue('');

    // 45 + 3 = 48 → Dudando (+3), announced politely after the reply.
    await expect(page.getByTestId('thermometer-announcement')).toHaveText(
      'Interés 48 de 100, Dudando (+3)',
    );
    await withPanel(page, async () => {
      const panel = panelScope(page);
      await expect(panel.getByRole('meter', { name: 'Interés del cliente' })).toHaveAttribute(
        'aria-valuenow',
        '48',
      );
      await expect(panel.getByTestId('thermometer-delta')).toHaveText('+3');
    });
    expect(await sessionRow(session.id)).toMatchObject({ seller_message_count: 1, interest: 48 });
  });

  test('revela datos y la objeción oculta con enlace al mensaje', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    await sendMessage(page, `¿Cuánto tienes pensado invertir? [[e2e:revelar:budget]] ${tag()}`);
    await expect(page.getByTestId('revealed-here')).toHaveText(/Dato revelado aquí: Presupuesto/);
    await expect(page.getByTestId('reveal-announcement')).toHaveText('Descubriste: Presupuesto');
    await withPanel(page, async () => {
      const panel = panelScope(page);
      await expect(panel.getByTestId('reveal-budget')).toHaveAttribute('data-state', 'unlocked');
      await expect(panel.getByTestId('reveal-budget')).toContainText('S/ 45 000 – S/ 50 000');
      await expect(panel.getByTestId('reveal-timeline')).toHaveAttribute('data-state', 'locked');
      await expect(panel.getByTestId('reveal-timeline')).not.toContainText('Antes de fin de año');
    });

    await sendMessage(page, `¿Hay algo más que te preocupe? [[e2e:oculta]] ${tag()}`);
    await expect(page.getByTestId('reveal-announcement')).toHaveText(
      'Descubriste: Objeción descubierta',
    );
    await withPanel(page, async () => {
      const hidden = panelScope(page).getByTestId('hidden-objections');
      await expect(hidden).toContainText(FAKE_PERSONA.hiddenObjection);
    });

    // The link takes the focus to the message where the datum appeared (desktop panel).
    const panel = page.getByTestId('session-panel');
    if (await panel.isVisible()) {
      await panel
        .getByTestId('reveal-budget')
        .getByRole('link', { name: 'Ver el mensaje' })
        .click();
      await expect(page.locator('#m3')).toBeFocused();
    }
  });

  test('pistas: una por turno y chips que insertan texto sin enviar', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, { focusStage: 'conoce' });
    await open(page, loginAs, seller, session.id);

    const hintButton = page.getByRole('button', { name: 'Pedir una pista' });
    await hintButton.click();
    await expect(page.getByTestId('hint')).toBeVisible();
    await expect(hintButton).toBeDisabled();
    expect((await sessionRow(session.id)).hints_used).toBe(1);

    const chips = page.getByTestId('idea-chips').getByRole('button');
    expect(await chips.count()).toBeGreaterThanOrEqual(2);
    expect(await chips.count()).toBeLessThanOrEqual(3);
    await chips.first().click();
    const composer = page.getByRole('textbox', { name: 'Tu mensaje' });
    await expect(composer).toHaveValue('¿Qué te llevó a buscar algo así justo ahora?');
    await expect(composer).toBeFocused();
    await expect(page.getByRole('log').getByTestId('chat-message')).toHaveCount(1);

    // A new turn allows a new hint.
    await composer.press('Enter');
    await expect(buyerMessages(page)).toHaveCount(2);
    await expect(hintButton).toBeEnabled();
  });

  test('sin pistas no hay botón ni chips', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, { hintsEnabled: false });
    await open(page, loginAs, seller, session.id);
    await expect(page.getByRole('button', { name: 'Pedir una pista' })).toHaveCount(0);
    await expect(page.getByTestId('idea-chips')).toHaveCount(0);
  });

  test('contador de 1.000 caracteres y Shift+Enter agrega una línea', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    const composer = page.getByRole('textbox', { name: 'Tu mensaje' });
    await composer.fill('x'.repeat(1200));
    await expect(composer).toHaveValue('x'.repeat(1000));
    await expect(page.getByTestId('composer-count')).toHaveText('1.000/1.000');

    await composer.fill('Primera línea');
    await composer.press('Shift+Enter');
    await composer.pressSequentially('segunda');
    await expect(composer).toHaveValue('Primera línea\nsegunda');
    await expect(page.getByRole('log').getByTestId('chat-message')).toHaveCount(1);
  });

  test('"Terminar y evaluar": deshabilitado sin mensajes y con confirmación', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);

    const finish = page.getByRole('button', { name: 'Terminar y evaluar' });
    await expect(finish).toBeDisabled();
    await expect(page.getByText('Envía al menos un mensaje para poder terminar.')).toBeVisible();

    await sendMessage(page, `Te cuento sobre el lote ${tag()}`);
    await expect(buyerMessages(page)).toHaveCount(2);
    await finish.click();
    const dialog = page.getByRole('dialog', { name: '¿Terminar la práctica?' });
    await dialog.getByRole('button', { name: 'Seguir conversando' }).click();
    await expect(dialog).toBeHidden();
    expect((await sessionRow(session.id)).status).toBe('active');

    await finish.click();
    await dialog.getByRole('button', { name: 'Terminar y evaluar' }).click();
    await expect(page.getByTestId('practice-finished')).toBeVisible();
    // The fake evaluator runs right after finishing: pending/in_progress or already evaluated.
    const finished = await sessionRow(session.id);
    expect(finished.end_reason).toBe('seller_ended');
    expect(['finalized', 'evaluated']).toContain(finished.status);
  });

  test('el cliente abandona tras 4 mensajes con interés bajo', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, { sellerMessages: 3, interest: 20 });
    await open(page, loginAs, seller, session.id);

    await sendMessage(page, `Compra ya o te quedas sin lote [[e2e:abandonar]] ${tag()}`);
    await expect(page.getByTestId('practice-finished')).toBeVisible();
    const abandoned = await sessionRow(session.id);
    expect(abandoned.end_reason).toBe('buyer_abandoned');
    expect(['finalized', 'evaluated']).toContain(abandoned.status);
  });

  test('cierre logrado con interés alto', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, { sellerMessages: 2, interest: 70 });
    await open(page, loginAs, seller, session.id);

    await sendMessage(page, `¿Agendamos la visita para el sábado? [[e2e:cerrar]] ${tag()}`);
    await expect(page.getByTestId('practice-finished')).toBeVisible();
    expect((await sessionRow(session.id)).end_reason).toBe('goal_achieved');
  });

  test('avisos de 3 mensajes y 3 minutos restantes', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, {
      sellerMessages: 17,
      deadlineInSeconds: 170,
    });
    await open(page, loginAs, seller, session.id);
    await withPanel(page, async () => {
      const panel = panelScope(page);
      await expect(panel.getByTestId('messages-left')).toHaveText('Te quedan 3 mensajes');
      await expect(panel.getByTestId('time-left')).toHaveText('Quedan 3 minutos');
    });
  });

  test('accesibilidad y teclado', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller, { sellerMessages: 1 });
    await open(page, loginAs, seller, session.id);
    await expectNoA11yViolations(page);

    const composer = page.getByRole('textbox', { name: 'Tu mensaje' });
    await composer.focus();
    await page.keyboard.type(`Hola de nuevo ${tag()}`);
    await page.keyboard.press('Enter');
    await expect(buyerMessages(page)).toHaveCount(3);
    await expectNoA11yViolations(page);
  });
});
