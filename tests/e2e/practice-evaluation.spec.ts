import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import { adminClient, createSeller, type CreatedSeller } from './fixtures/factories';
import { createActiveSession } from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US6 · evaluación automática (scenarios 1, 5; quickstart 12, 15; FR-036–FR-043, SC-002). The fake
 * evaluator (src/lib/ai/fake/evaluator.ts) builds a valid evaluation from the transcript (Σ round(0.7 ·
 * weight) = 71) and obeys `[[e2e:eval-lenta:N]]` and `[[e2e:eval-falla]]` in any seller message.
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
}

async function sendAndFinish(page: Page, text: string) {
  await expect(page.getByTestId('practice-session')).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'Tu mensaje' });
  await composer.fill(text);
  await composer.press('Enter');
  await expect(
    page.getByRole('log').locator('[data-testid="chat-message"][data-author="buyer"]'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Terminar y evaluar' }).click();
  await page
    .getByRole('dialog', { name: '¿Terminar la práctica?' })
    .getByRole('button', { name: 'Terminar y evaluar' })
    .click();
  await expect(page.getByTestId('practice-finished')).toBeVisible();
}

async function consumptions(sessionId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from('simulation_consumptions')
    .select('session_id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  expect(error).toBeNull();
  return count ?? 0;
}

test.describe('US6 · evaluación automática', () => {
  test('progreso por fases, salir y volver, y resultado evaluado', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);
    await sendAndFinish(page, `Hola Rosa, ¿qué buscas en un lote? [[e2e:eval-lenta:6]] ${tag()}`);

    const progress = page.getByTestId('evaluation-progress');
    await expect(progress).toBeVisible();
    // The sr-only status repeats the current phase: assert the steps of the list.
    const steps = progress.getByRole('listitem');
    await expect(steps.filter({ hasText: 'Leyendo la conversación' })).toBeVisible();
    await expect(steps.filter({ hasText: 'Evaluando criterios' })).toBeVisible();
    await expect(steps.filter({ hasText: 'Preparando tu reporte' })).toBeVisible();
    await expect(progress).toHaveAttribute('data-phase', 'scoring', { timeout: 10_000 });
    await expectNoA11yViolations(page);

    // The evaluation keeps running without the page.
    await page.goto('/practicar');
    await page.goto(`/practicas/${session.id}`);
    await expect(page.getByTestId('evaluation-summary')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('evaluation-total')).toHaveText('71 de 100');
    await expect(page.getByTestId('evaluation-level')).toHaveText('En desarrollo');
    await expect(page.getByTestId('transcript-message')).toHaveCount(3);
    expect(await consumptions(session.id)).toBe(1);
  });

  test('evaluación fallida → 3 reintentos manuales → no disponible, sin consumir cuota', async ({
    page,
    loginAs,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    await open(page, loginAs, seller, session.id);
    await sendAndFinish(page, `Te ofrezco el lote [[e2e:eval-falla]] ${tag()}`);

    const failed = page.getByTestId('evaluation-failed');
    for (const left of [3, 2, 1]) {
      await expect(failed).toBeVisible({ timeout: 30_000 });
      await expect(failed.getByTestId('retries-left')).toHaveText(
        left === 1 ? 'Te queda 1 reintento' : `Te quedan ${left} reintentos`,
      );
      if (left === 3) await expectNoA11yViolations(page);
      await failed.getByRole('button', { name: 'Reintentar evaluación' }).click();
      await expect(failed).toBeHidden();
    }

    const unavailable = page.getByTestId('evaluation-unavailable');
    await expect(unavailable).toBeVisible({ timeout: 30_000 });
    await expect(unavailable.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('transcript-message')).toHaveCount(3);

    const { data } = await adminClient()
      .from('practice_sessions')
      .select('status, evaluation_status, evaluation_manual_retries')
      .eq('id', session.id)
      .single();
    expect(data).toEqual({
      status: 'finalized',
      evaluation_status: 'unavailable',
      evaluation_manual_retries: 3,
    });
    expect(await consumptions(session.id)).toBe(1);
  });

  test('sesión sin mensajes del vendedor → no evaluada', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const session = await createActiveSession(seller);
    // Closed by time without seller messages (what maintenance does, FR-028d).
    const { error } = await adminClient()
      .from('practice_sessions')
      .update({
        status: 'finalized',
        end_reason: 'time_limit',
        ended_at: new Date().toISOString(),
        evaluation_status: 'not_applicable',
      })
      .eq('id', session.id);
    expect(error).toBeNull();

    await open(page, loginAs, seller, session.id);
    await expect(page.getByTestId('evaluation-not-applicable')).toContainText(
      'No fue evaluada porque no enviaste mensajes',
    );
    await expect(page.getByTestId('evaluation-progress')).toHaveCount(0);
    await expectNoA11yViolations(page);
  });
});
