import { adminClient, createSeller } from './fixtures/factories';
import {
  bumpProductVersion,
  createActiveSession,
  createEvaluatedSession,
  createObjections,
  createProduct,
  setQuota,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * US7 · "Practicar de nuevo" (scenario 5; quickstart 14; FR-048): same configuration with the current
 * product version and the suggested stage (innova in the factory) as focus; a fresh buyer setup.
 */
test.describe('US7 · practicar de nuevo', () => {
  test('crea una práctica configurada con la misma configuración y la versión vigente', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const product = await createProduct(seller);
    const objectionIds = await createObjections(seller, product.id, [
      { text: 'Me queda muy lejos de Lima.', category: 'logistics' },
      { text: 'Está caro para mi presupuesto.', category: 'price' },
    ]);
    const source = await createEvaluatedSession(seller, {
      product,
      objectionIds,
      difficulty: 2,
      hintsEnabled: false,
    });
    await bumpProductVersion(seller, product, `${product.name} v2`);

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${source.id}`);
    await page.getByRole('button', { name: 'Practicar de nuevo' }).click();

    await expect(page.getByRole('heading', { name: 'Tu práctica está lista' })).toBeVisible();
    const newId = page.url().split('/').pop()!;
    expect(newId).not.toBe(source.id);
    await expect(page.getByText('(versión 2)')).toBeVisible();
    await expect(page.getByText('Innova')).toBeVisible();

    const { data } = await adminClient()
      .from('practice_sessions')
      .select(
        'status, product_id, product_version, selected_objection_ids, difficulty, hints_enabled, focus_stage',
      )
      .eq('id', newId)
      .single();
    expect(data).toMatchObject({
      status: 'configured',
      product_id: product.id,
      product_version: 2,
      difficulty: 2,
      hints_enabled: false,
      focus_stage: 'innova',
    });
    expect([...data!.selected_objection_ids].sort()).toEqual([...objectionIds].sort());
  });

  test('producto archivado → /practicar con aviso de configuración cambiada', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const source = await createEvaluatedSession(seller);
    const { error } = await adminClient()
      .from('products')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', source.product.id);
    expect(error).toBeNull();

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${source.id}`);
    await page.getByRole('button', { name: 'Practicar de nuevo' }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/practicar\\?producto=${source.product.id}&foco=innova&aviso=configuracion-cambiada`,
      ),
    );
    await expect(page.getByText('La configuración cambió')).toBeVisible();
  });

  test('objeción eliminada → /practicar con aviso', async ({ page, loginAs }) => {
    const seller = await createSeller();
    const source = await createEvaluatedSession(seller);
    const { error } = await adminClient()
      .from('objections')
      .delete()
      .eq('id', source.objectionIds[0]!);
    expect(error).toBeNull();

    await loginAs({ email: seller.email, password: seller.password });
    await page.goto(`/practicas/${source.id}`);
    await page.getByRole('button', { name: 'Practicar de nuevo' }).click();
    await expect(page).toHaveURL(/aviso=configuracion-cambiada/);
  });

  test('con la cuota agotada se bloquea; con una práctica activa ofrece "Retomar"', async ({
    page,
    loginAs,
  }) => {
    const seller = await createSeller();
    const source = await createEvaluatedSession(seller);
    await loginAs({ email: seller.email, password: seller.password });

    // The evaluated session already consumed today's only simulation.
    await setQuota(seller.orgId, 1, 30);
    await page.goto(`/practicas/${source.id}`);
    await page.getByRole('button', { name: 'Practicar de nuevo' }).click();
    const drill = page.getByTestId('suggested-drill');
    await expect(drill.getByRole('alert')).toContainText(/límite/i);
    await expect(page).toHaveURL(new RegExp(`/practicas/${source.id}$`));

    await setQuota(seller.orgId, 10, 30);
    const active = await createActiveSession(seller, { product: source.product });
    await page.reload();
    await page.getByRole('button', { name: 'Practicar de nuevo' }).click();
    await expect(drill.getByRole('link', { name: 'Retomar la práctica' })).toHaveAttribute(
      'href',
      `/practicas/${active.id}`,
    );
  });
});
