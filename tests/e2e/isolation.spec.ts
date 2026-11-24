import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/supabase/database.types';
import { testEnv } from './fixtures/env';
import { SEED_PASSWORD, SEED_USERS } from './fixtures/seed-data';
import { expect, test } from './fixtures/test';

/**
 * Isolation suite (AC-01, FR-005, SC-004). With seller A's own session, the REST API (PostgREST + RLS)
 * never returns or changes organization B's data, and every admin surface answers "sin permiso".
 * Seed data is only read: writes are all expected to fail.
 */

const ORG_A = SEED_USERS.vendedorA.orgId;
const ORG_B = SEED_USERS.vendedorB.orgId;
const TABLES = ['quotas', 'organizations', 'memberships', 'ai_usage', 'teams'] as const;

async function sellerAClient() {
  const client = createClient<Database>(
    testEnv('NEXT_PUBLIC_SUPABASE_URL'),
    testEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error } = await client.auth.signInWithPassword({
    email: SEED_USERS.vendedorA.email,
    password: SEED_PASSWORD,
  });
  expect(error).toBeNull();
  return client;
}

test.describe('aislamiento entre organizaciones (vendedor A vs. B)', () => {
  test('REST: lecturas de B devuelven cero filas y las de A sí responden', async () => {
    const client = await sellerAClient();
    for (const table of TABLES) {
      const column = table === 'organizations' ? 'id' : 'organization_id';
      // Untyped on purpose: the loop mixes tables whose filter column differs.
      const ofB = await (client as unknown as SupabaseClient)
        .from(table)
        .select('*')
        .eq(column, ORG_B);
      expect(ofB.error, `${table} read error`).toBeNull();
      expect(ofB.data, `${table} of B`).toEqual([]);
    }
    const ownQuota = await client
      .from('quotas')
      .select('organization_id')
      .eq('organization_id', ORG_A);
    expect(ownQuota.data).toHaveLength(1);
    const ownOrgs = await client.from('organizations').select('id');
    expect(ownOrgs.data?.map((o) => o.id)).toEqual([ORG_A]);
    for (const table of ['invitations', 'access_requests', 'audit_logs'] as const) {
      const rows = await client.from(table).select('id').limit(1);
      expect(rows.data, `${table} visible to a seller`).toEqual([]);
    }
    // Local scope: a global sign-out would end other tests' sessions of the shared seed seller.
    await client.auth.signOut({ scope: 'local' });
  });

  test('REST: escrituras directas sobre datos de B se rechazan', async () => {
    const client = await sellerAClient();
    const inserts = [
      client
        .from('organizations')
        .insert({ type: 'personal', name: 'Intrusa', slug: `intrusa-${Date.now()}` }),
      client
        .from('memberships')
        .insert({ organization_id: ORG_B, user_id: SEED_USERS.vendedorA.id, roles: ['vendedor'] }),
      client.from('quotas').insert({ organization_id: ORG_B }),
      client.from('teams').insert({ organization_id: ORG_B, name: 'Intrusos' }),
      client.from('ai_usage').insert({
        organization_id: ORG_B,
        task: 'buyer',
        model: 'x',
        input_tokens: 1,
        output_tokens: 1,
        latency_ms: 1,
        estimated_cost_usd: 0,
      }),
    ];
    for (const result of await Promise.all(inserts)) expect(result.error?.code).toBe('42501');

    const updateQuota = await client
      .from('quotas')
      .update({ daily_limit: 999 })
      .eq('organization_id', ORG_B)
      .select();
    expect(updateQuota.error?.code ?? 'no-rows').toMatch(/42501|no-rows/);
    expect(updateQuota.data ?? []).toEqual([]);
    const deleteMembership = await client
      .from('memberships')
      .delete()
      .eq('organization_id', ORG_B)
      .select();
    expect(deleteMembership.data ?? []).toEqual([]);

    for (const [fn, args] of [
      ['admin_update_quota', { p_org: ORG_B, p_daily: 1, p_monthly: 2 }],
      [
        'admin_set_organization_status',
        { p_org: ORG_B, p_status: 'suspended', p_reason: 'intrusión' },
      ],
      ['admin_list_organizations', { p_q: null, p_limit: 20, p_offset: 0 }],
    ] as const) {
      const { error } = await client.rpc(fn as 'admin_update_quota', args as never);
      expect(error?.code, fn).toBe('42501');
    }

    // B's data is unchanged.
    const { data } = await createClient<Database>(
      testEnv('NEXT_PUBLIC_SUPABASE_URL'),
      testEnv('SUPABASE_SECRET_KEY'),
      {
        auth: { persistSession: false },
      },
    )
      .from('quotas')
      .select('daily_limit')
      .eq('organization_id', ORG_B)
      .single();
    expect(data?.daily_limit).not.toBe(999);
    // Local scope: a global sign-out would end other tests' sessions of the shared seed seller.
    await client.auth.signOut({ scope: 'local' });
  });

  test('rutas de administración con ids de B responden "sin permiso"', async ({
    page,
    loginAs,
  }) => {
    await loginAs('vendedorA');
    for (const path of [
      `/admin/organizaciones?q=${encodeURIComponent('Bruno')}`,
      '/admin/consumo',
      '/admin/invitaciones',
      `/admin/invitaciones/nueva?solicitud=00000000-0000-4000-f000-000000000001`,
      '/admin/solicitudes',
      '/design',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(page.getByRole('main')).not.toContainText('Bruno Vendedor');
    }
  });
});
