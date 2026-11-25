import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/supabase/database.types';
import { testEnv } from './fixtures/env';
import { adminClient, createSeller, type CreatedSeller } from './fixtures/factories';
import {
  createActiveSession,
  createConfiguredSession,
  createEvaluatedSession,
  createObjections,
  createProduct,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * Practice isolation (T188; AC-01, FR-055, SC-011, quickstart 19). Seller B, with their own session,
 * never reads or changes seller A's products, practices or evaluations: pages answer "not found",
 * route handlers 404, Server Actions fail without revealing existence (B's own legitimate request is
 * intercepted and A's id swapped in) and PostgREST returns no rows. The internal dispatcher needs the
 * Bearer secret.
 */
type Login = (u: { email: string; password: string }) => Promise<void>;

async function failedSession(seller: CreatedSeller) {
  const session = await createActiveSession(seller, { sellerMessages: 1 });
  const { error } = await adminClient()
    .from('practice_sessions')
    .update({
      status: 'finalized',
      end_reason: 'seller_ended',
      ended_at: new Date().toISOString(),
      evaluation_status: 'failed',
      evaluation_failure_code: 'provider_error',
      evaluation_due_at: new Date().toISOString(),
    })
    .eq('id', session.id);
  expect(error).toBeNull();
  return session;
}

/** Rewrites B's id into A's id in every Server Action request of the page. */
async function swapActionIds(page: Page, from: string, to: string) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const body = request.postData();
    if (request.method() === 'POST' && request.headers()['next-action'] && body?.includes(from)) {
      await route.continue({ postData: body.replaceAll(from, to) });
      return;
    }
    await route.continue();
  });
}

async function sessionRow(id: string) {
  const { data } = await adminClient()
    .from('practice_sessions')
    .select('status, evaluation_status, evaluation_manual_retries')
    .eq('id', id)
    .single();
  return data;
}

test.describe('aislamiento de la práctica (vendedor A vs. B)', () => {
  test('páginas y route handlers con ids de A → no encontrado', async ({ page, loginAs }) => {
    const a = await createSeller();
    const productA = await createProduct(a);
    const evaluatedA = await createEvaluatedSession(a, { product: productA });
    const activeA = await createActiveSession(a, { product: productA });
    const b = await createSeller();
    await (loginAs as Login)({ email: b.email, password: b.password });

    for (const path of [
      `/productos/${productA.id}`,
      `/productos/${productA.id}?pestana=objeciones`,
      `/practicas/${evaluatedA.id}`,
      `/practicas/${activeA.id}`,
    ]) {
      // With loading.tsx the response is already streaming when notFound() runs: the status is 200
      // but the page is the "not found" one (noindex), with nothing of A.
      await page.goto(path);
      await expect(page.getByRole('heading', { name: /^No encontramos/ })).toBeVisible();
      await expect(page.getByText(productA.name)).toHaveCount(0);
    }

    const turn = await page.request.post(`/api/practicas/${activeA.id}/turnos`, {
      data: { clientMessageId: randomUUID(), text: 'Hola, ¿qué buscas?' },
    });
    expect(turn.status()).toBe(404);
    expect(await turn.json()).toMatchObject({ code: 'not_found' });
    const status = await page.request.get(`/api/practicas/${evaluatedA.id}/estado`);
    expect(status.status()).toBe(404);
    expect(await status.json()).toMatchObject({ code: 'not_found' });
    const { count } = await adminClient()
      .from('practice_messages')
      .select('seq', { count: 'exact', head: true })
      .eq('session_id', activeA.id);
    expect(count).toBe(1);

    const internal = await page.request.post('/api/internal/practice/evaluations', {
      data: { sessionIds: [evaluatedA.id] },
    });
    expect(internal.status()).toBe(401);
  });

  test('Server Actions con ids de A no cambian nada ni revelan existencia', async ({
    page,
    loginAs,
  }) => {
    test.slow();
    const a = await createSeller();
    const productA = await createProduct(a);
    const [objectionA] = await createObjections(a, productA.id);
    const configuredA = await createConfiguredSession(a, { product: productA });
    const b = await createSeller();
    const productB = await createProduct(b);
    const [objectionB] = await createObjections(b, productB.id);
    await (loginAs as Login)({ email: b.email, password: b.password });

    // updateProduct
    await swapActionIds(page, productB.id, productA.id);
    await page.goto(`/productos/${productB.id}`);
    await page.getByLabel('Nombre del producto o servicio').fill('Nombre cambiado por B');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /no encontramos/i })).toBeVisible();
    const { data: product } = await adminClient()
      .from('products')
      .select('current_name, current_version')
      .eq('id', productA.id)
      .single();
    expect(product).toEqual({ current_name: productA.name, current_version: 1 });
    await page.unrouteAll();

    // deleteObjection
    await swapActionIds(page, objectionB!, objectionA!);
    await page.goto(`/productos/${productB.id}?pestana=objeciones`);
    await page
      .getByRole('list', { name: 'Objeciones registradas' })
      .getByRole('button', { name: /^Eliminar objeción/ })
      .click();
    await page
      .getByRole('dialog', { name: '¿Eliminar esta objeción?' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(page.getByText('Eliminamos la objeción.')).toHaveCount(0);
    const { count: objections } = await adminClient()
      .from('objections')
      .select('id', { count: 'exact', head: true })
      .eq('id', objectionA!);
    expect(objections).toBe(1);
    await page.unrouteAll();

    // startPractice
    const configuredB = await createConfiguredSession(b, { product: productB });
    await swapActionIds(page, configuredB.id, configuredA.id);
    await page.goto(`/practicas/${configuredB.id}`);
    await page.getByRole('button', { name: 'Comenzar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await sessionRow(configuredA.id))?.status).toBe('configured');
    const { count: consumptions } = await adminClient()
      .from('simulation_consumptions')
      .select('session_id', { count: 'exact', head: true })
      .eq('session_id', configuredA.id);
    expect(consumptions).toBe(0);
    await page.unrouteAll();
  });

  test('terminar, reintentar y practicar de nuevo con ids de A', async ({ page, loginAs }) => {
    test.slow();
    // Only one active session per seller: finished ones first, the active one last.
    const a = await createSeller();
    const failedA = await failedSession(a);
    const evaluatedA = await createEvaluatedSession(a);
    const activeA = await createActiveSession(a, { sellerMessages: 1 });
    const b = await createSeller();
    const failedB = await failedSession(b);
    const evaluatedB = await createEvaluatedSession(b);
    const activeB = await createActiveSession(b, { sellerMessages: 1 });
    await (loginAs as Login)({ email: b.email, password: b.password });

    // finishPractice
    await swapActionIds(page, activeB.id, activeA.id);
    await page.goto(`/practicas/${activeB.id}`);
    await page.getByRole('button', { name: 'Terminar y evaluar' }).click();
    await page
      .getByRole('dialog', { name: '¿Terminar la práctica?' })
      .getByRole('button', { name: 'Terminar y evaluar' })
      .click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    expect((await sessionRow(activeA.id))?.status).toBe('active');
    await page.unrouteAll();

    // retryEvaluation
    await swapActionIds(page, failedB.id, failedA.id);
    await page.goto(`/practicas/${failedB.id}`);
    await page.getByRole('button', { name: 'Reintentar evaluación' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await sessionRow(failedA.id)).toMatchObject({
      evaluation_status: 'failed',
      evaluation_manual_retries: 0,
    });
    await page.unrouteAll();

    // practiceAgain (B's active session is now finished by B itself to allow a new setup)
    await adminClient()
      .from('practice_sessions')
      .update({
        status: 'finalized',
        end_reason: 'seller_ended',
        ended_at: new Date().toISOString(),
        evaluation_status: 'not_applicable',
      })
      .eq('id', activeB.id);
    await swapActionIds(page, evaluatedB.id, evaluatedA.id);
    await page.goto(`/practicas/${evaluatedB.id}`);
    await page.getByRole('button', { name: 'Practicar de nuevo' }).click();
    await expect(page.getByTestId('suggested-drill').getByRole('alert')).toContainText(
      'No encontramos lo que buscas.',
    );
    const { count } = await adminClient()
      .from('practice_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', a.id);
    expect(count).toBe(3);
    await page.unrouteAll();
  });

  test('PostgREST: B no lee mensajes, secretos ni evaluaciones de A', async () => {
    const a = await createSeller();
    const evaluatedA = await createEvaluatedSession(a);
    const b = await createSeller();
    const client = createClient<Database>(
      testEnv('NEXT_PUBLIC_SUPABASE_URL'),
      testEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await client.auth.signInWithPassword({
      email: b.email,
      password: b.password,
    });
    expect(error).toBeNull();

    const messages = await client
      .from('practice_messages')
      .select('seq')
      .eq('session_id', evaluatedA.id);
    const secrets = await client
      .from('practice_session_secrets')
      .select('session_id')
      .eq('session_id', evaluatedA.id);
    const evaluations = await client
      .from('practice_evaluations')
      .select('id')
      .eq('session_id', evaluatedA.id);
    const criteria = await client
      .from('practice_evaluation_criteria')
      .select('id')
      .eq('evaluation_id', evaluatedA.evaluationId);
    for (const result of [messages, secrets, evaluations, criteria]) {
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    const history = await client.rpc('my_practice_history', {});
    expect(history.data?.map((r) => r.session_id) ?? []).not.toContain(evaluatedA.id);
    await client.auth.signOut({ scope: 'local' });
  });
});
