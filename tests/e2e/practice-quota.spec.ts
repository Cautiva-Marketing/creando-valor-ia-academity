import { adminClient, anonClient, createSeller } from './fixtures/factories';
import {
  createActiveSession,
  createConfiguredSession,
  createObjections,
  createProduct,
  setQuota,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/** US3 · cuotas y topes (scenario 6, edge cases; FR-016–FR-018, SC-005, SC-012). */

async function usageRows(userId: string) {
  const { count, error } = await adminClient()
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  expect(error).toBeNull();
  return count ?? 0;
}

test.describe('US3 · cuota de simulaciones', () => {
  test('cuota diaria agotada: Practicar bloqueado con la renovación y sin llamar a la IA', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller);
    const objectionIds = await createObjections(seller, product.id, [
      'Me queda muy lejos de Lima.',
    ]);
    // One simulation used today and a daily limit of 1.
    const used = await createActiveSession(seller, { product, objectionIds });
    await adminClient()
      .from('practice_sessions')
      .update({
        status: 'finalized',
        end_reason: 'seller_ended',
        ended_at: new Date().toISOString(),
        evaluation_status: 'not_applicable',
      })
      .eq('id', used.id);
    await setQuota(seller.orgId, 1, 100);

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto('/practicar');
    const blocked = page.getByTestId('quota-blocked');
    await expect(blocked).toContainText('Alcanzaste tu límite diario de simulaciones');
    await expect(blocked).toContainText('Se renueva el');
    await expect(page.getByTestId('quota-summary')).toContainText('Te quedan 0 simulaciones hoy');

    const before = await usageRows(seller.id);
    const form = page.getByRole('form', { name: 'Configurar práctica' });
    await form.getByRole('checkbox', { name: 'Me queda muy lejos de Lima.' }).check();
    await expect(form.getByRole('button', { name: 'Preparar mi comprador' })).toBeDisabled();
    expect(await usageRows(seller.id)).toBe(before);
  });

  test('cuota deshabilitada (0) se explica sin fecha de renovación', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await createProduct(seller);
    await setQuota(seller.orgId, 0, 0);
    await loginAs({ email: seller.email, password: seller.password });
    await page.goto('/practicar');
    await expect(page.getByTestId('quota-blocked')).toContainText(
      'Tu organización no tiene simulaciones habilitadas.',
    );
  });

  test('cuota agotada entre configurar y comenzar: bloquea al comenzar y la configurada sigue', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const configured = await createConfiguredSession(seller);
    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${configured.id}`);
    await expect(page.getByRole('heading', { name: 'Tu práctica está lista' })).toBeVisible();

    await setQuota(seller.orgId, 0, 0);
    await page.getByRole('button', { name: 'Comenzar' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Tu organización no tiene simulaciones habilitadas.',
    );
    await expect(page.getByRole('button', { name: 'Comenzar' })).toBeEnabled();

    const { data } = await adminClient()
      .from('practice_sessions')
      .select('status')
      .eq('id', configured.id)
      .single();
    expect(data?.status).toBe('configured');
    const consumptions = await adminClient()
      .from('simulation_consumptions')
      .select('session_id')
      .eq('user_id', seller.id);
    expect(consumptions.data).toEqual([]);
  });

  test('dos "Comenzar" simultáneos (dos pestañas) consumen una sola simulación', async () => {
    // A user has at most one configured practice (unique index), so concurrency is two starts of it.
    const seller = await createSeller();
    const configured = await createConfiguredSession(seller);
    await setQuota(seller.orgId, 1, 100);

    const tabs = [anonClient(), anonClient()];
    for (const client of tabs) {
      await client.auth.signInWithPassword({ email: seller.email, password: seller.password });
    }
    const results = await Promise.all(
      tabs.map((client) => client.rpc('start_practice_session', { p_session: configured.id })),
    );
    expect(results.map((r) => r.error)).toEqual([null, null]);
    expect(results.map((r) => r.data?.[0]?.already_active).sort()).toEqual([false, true]);

    const consumptions = await adminClient()
      .from('simulation_consumptions')
      .select('session_id')
      .eq('user_id', seller.id);
    expect(consumptions.data).toHaveLength(1);
  });

  test('30 configuraciones fallidas hoy bloquean configurar hasta mañana con la hora', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller);
    await createObjections(seller, product.id, ['Me queda muy lejos de Lima.']);
    const { error } = await adminClient()
      .from('practice_setup_attempts')
      .insert(
        Array.from({ length: 30 }, () => ({
          organization_id: seller.orgId,
          user_id: seller.id,
          outcome: 'failure' as const,
          failure_code: 'provider_unavailable',
        })),
      );
    expect(error).toBeNull();

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto('/practicar');
    await expect(page.getByTestId('quota-blocked')).toContainText(
      'Alcanzaste el máximo de intentos fallidos de configuración de hoy. Podrás volver a configurar desde el',
    );
    await expect(
      page
        .getByRole('form', { name: 'Configurar práctica' })
        .getByRole('button', { name: 'Preparar mi comprador' }),
    ).toBeDisabled();
  });
});
