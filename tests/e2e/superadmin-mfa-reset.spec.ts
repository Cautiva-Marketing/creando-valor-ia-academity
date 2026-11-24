import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signIn } from './fixtures/auth';
import { adminClient, auditEventsFor, createSuperadmin } from './fixtures/factories';
import { expect, test } from './fixtures/test';
import { signInViaUi } from './support/auth-ui';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** FR-027a, SC-010: the operations script resets MFA, revokes sessions and audits once. */
test.describe('US4 · reset operativo de MFA', () => {
  test('elimina factores, revoca sesiones, audita y exige registrar de nuevo', async ({
    page,
    browser,
    baseURL,
  }) => {
    const admin = await createSuperadmin({ withFactor: true });
    const open = await browser.newContext({ baseURL });
    await signIn(
      open,
      {
        email: admin.email,
        password: admin.password,
        totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
      },
      baseURL,
    );
    const openPage = await open.newPage();
    await openPage.goto('/admin');
    await expect(openPage).toHaveURL(/\/admin\/invitaciones$/);

    execFileSync(
      process.execPath,
      [
        `${ROOT}/node_modules/tsx/dist/cli.mjs`,
        'scripts/ops/reset-superadmin-mfa.ts',
        '--email',
        admin.email,
        '--operator',
        'ci',
      ],
      { cwd: ROOT, env: process.env, stdio: 'pipe' },
    );

    const { data: factors } = await adminClient().auth.admin.mfa.listFactors({ userId: admin.id });
    expect(factors?.factors ?? []).toHaveLength(0);

    await openPage.goto('/admin');
    await expect(openPage).toHaveURL(/\/iniciar-sesion/);
    await open.close();

    const resets = (await auditEventsFor(admin.id)).filter(
      (e) => e.action === 'superadmin.mfa_reset',
    );
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({
      actor_type: 'operator',
      actor_label: 'ci',
      actor_user_id: null,
    });
    expect(
      (resets[0]!.data as { sessions_revoked: number }).sessions_revoked,
    ).toBeGreaterThanOrEqual(1);

    await signInViaUi(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/mfa\/registrar$/);
  });
});
