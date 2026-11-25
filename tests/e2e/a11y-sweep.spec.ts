import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './fixtures/axe';
import {
  adminClient,
  createInvitation,
  createSeller,
  createSuperadmin,
} from './fixtures/factories';
import {
  createActiveSession,
  createConfiguredSession,
  createEvaluatedSession,
  createObjections,
  createProduct,
} from './fixtures/practice-factories';
import { expect, test } from './fixtures/test';

/**
 * Accessibility sweep (SC-006, FR-052): every route of contracts/routes.md in each Playwright project
 * (360 px and desktop × light and dark) has no serious/critical axe violations, no horizontal scroll
 * and touch targets ≥ 44 px; the main forms work with the keyboard only.
 */

const TARGET = 44;

/**
 * Interactive elements smaller than 44 px in both dimensions. Exceptions (WCAG 2.5.5/2.5.8): inline
 * links inside text, controls whose label extends the target (checkbox/radio/switch + label) and
 * controls with the `hit-area-y` utility (pseudo-element enlarges the target).
 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="combobox"], [role="menuitem"]';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"], .sr-only, [data-a11y-sweep-skip]')) continue;
      if (el.tagName === 'A' && style.display === 'inline') continue;
      if (el.className.toString().includes('hit-area')) continue;
      let height = rect.height;
      let width = rect.width;
      const label = el.id
        ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`)
        : null;
      if (label) {
        const box = label.getBoundingClientRect();
        height = Math.max(
          height,
          box.height,
          el.parentElement?.getBoundingClientRect().height ?? 0,
        );
        width = Math.max(width, box.width);
      }
      if (height < min - 0.5 && width < min - 0.5) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40)}" ${Math.round(width)}×${Math.round(height)}`,
        );
      } else if (height < min - 0.5 && !['A'].includes(el.tagName) && style.display !== 'inline') {
        // Controls must be at least 44 px tall (full-width buttons and fields included).
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40)}" height ${Math.round(height)}`,
        );
      }
    }
    return out;
  }, TARGET);
}

async function checkPage(page: Page, path: string, expectedUrl?: RegExp) {
  await page.goto(path);
  if (expectedUrl) await expect(page).toHaveURL(expectedUrl);
  await expect(page.locator('h1').first()).toBeVisible();
  await expectNoA11yViolations(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${path}: horizontal scroll`).toBeLessThanOrEqual(0);
  expect(await smallTargets(page), `${path}: targets < 44 px`).toEqual([]);
}

test.describe('barrido de accesibilidad', () => {
  // T173: the Content-Security-Policy sent by the proxy must not block anything on any route.
  const cspViolations: string[] = [];
  test.beforeEach(({ page }) => {
    cspViolations.length = 0;
    page.on('console', (message) => {
      // Only real CSP blocks (Vercel analytics scripts 404 locally with a MIME-type message: not CSP).
      if (/Content Security Policy/i.test(message.text())) {
        cspViolations.push(message.text().slice(0, 200));
      }
    });
  });
  test.afterEach(() => {
    expect(cspViolations, 'CSP violations').toEqual([]);
  });

  test('rutas públicas y de autenticación', async ({ page }) => {
    const invitation = await createInvitation();
    for (const path of [
      '/',
      '/solicitar-acceso',
      '/terminos',
      '/privacidad',
      '/aviso-ia',
      '/iniciar-sesion',
      '/recuperar-contrasena',
      '/recuperar-contrasena?estado=enlace-invalido',
      `/invitacion/${invitation.token}`,
      `/invitacion/${'x'.repeat(43)}`,
      '/esta-ruta-no-existe',
    ]) {
      await checkPage(page, path);
    }
    // Without a recovery session the reset page sends the person back to request a link.
    await checkPage(page, '/restablecer-contrasena');
  });

  test('rutas del vendedor y "sin permiso"', async ({ page, loginAs }) => {
    const seller = await createSeller({ onboardingStatus: 'pending' });
    await loginAs({ email: seller.email, password: seller.password });
    await checkPage(page, '/onboarding');
    await checkPage(page, '/inicio');
    await checkPage(page, '/perfil');
    await checkPage(page, '/admin/consumo');
  });

  test('rutas de la práctica (002): Hoy, productos, práctica en cada estado e historial', async ({
    page,
    loginAs,
  }) => {
    test.slow();
    const seller = await createSeller();
    const product = await createProduct(seller);
    await createObjections(seller, product.id);
    const evaluated = await createEvaluatedSession(seller, {
      product,
      flags: [{ type: 'undue_pressure', explanation: 'Presionaste.', seqs: [4] }],
    });
    const finished = async (status: 'pending' | 'failed') => {
      const session = await createActiveSession(seller, { product, sellerMessages: 1 });
      const { error } = await adminClient()
        .from('practice_sessions')
        .update({
          status: 'finalized',
          end_reason: 'seller_ended',
          ended_at: new Date().toISOString(),
          evaluation_status: status,
          evaluation_failure_code: status === 'failed' ? 'provider_error' : null,
          evaluation_due_at: new Date(
            Date.now() + (status === 'pending' ? 600_000 : 0),
          ).toISOString(),
        })
        .eq('id', session.id);
      expect(error).toBeNull();
      return session;
    };
    const failed = await finished('failed');
    const pending = await finished('pending');
    const active = await createActiveSession(seller, { product, sellerMessages: 2 });

    await loginAs({ email: seller.email, password: seller.password });
    for (const path of [
      '/inicio',
      '/productos',
      '/productos/nuevo',
      `/productos/${product.id}`,
      `/productos/${product.id}?pestana=objeciones`,
      '/practicar',
      `/practicas/${active.id}`,
      `/practicas/${pending.id}`,
      `/practicas/${failed.id}`,
      `/practicas/${evaluated.id}`,
      '/historial',
    ]) {
      await checkPage(page, path);
    }

    // The pre-screen of a configured practice (only one active or configured at a time).
    await adminClient()
      .from('practice_sessions')
      .update({
        status: 'finalized',
        end_reason: 'seller_ended',
        ended_at: new Date().toISOString(),
        evaluation_status: 'not_applicable',
      })
      .eq('id', active.id);
    const configured = await createConfiguredSession(seller, { product });
    await checkPage(page, `/practicas/${configured.id}`);
  });

  test('acceso suspendido', async ({ page, loginAs }) => {
    await loginAs('vendedorD');
    await checkPage(page, '/acceso-suspendido', /\/acceso-suspendido$/);
  });

  test('MFA: registrar y verificar', async ({ page, loginAs }) => {
    const withoutFactor = await createSuperadmin({ withFactor: false });
    await loginAs({ email: withoutFactor.email, password: withoutFactor.password });
    await checkPage(page, '/mfa/registrar', /\/mfa\/registrar$/);

    await page.context().clearCookies();
    const withFactor = await createSuperadmin();
    await loginAs({ email: withFactor.email, password: withFactor.password });
    await checkPage(page, '/mfa/verificar', /\/mfa\/verificar/);
  });

  test('rutas del superadmin', async ({ page, loginAs }) => {
    test.slow();
    const admin = await createSuperadmin();
    await loginAs({
      email: admin.email,
      password: admin.password,
      totp: { secret: admin.totpSecret!, factorId: admin.factorId! },
    });
    for (const path of [
      '/admin/invitaciones',
      '/admin/invitaciones/nueva',
      '/admin/solicitudes',
      '/admin/organizaciones',
      '/admin/consumo',
      '/admin/consumo?periodo=previous_month',
      '/perfil',
      '/design',
    ]) {
      await checkPage(page, path);
    }
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/invitaciones$/);
  });
});

test.describe('formularios solo con teclado', () => {
  test('iniciar sesión', async ({ page }) => {
    const seller = await createSeller();
    await page.goto('/iniciar-sesion');
    await page.getByRole('textbox', { name: /Correo/ }).focus();
    await page.keyboard.type(seller.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(seller.password);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/inicio$/, { timeout: 30_000 });
  });

  test('solicitar acceso', async ({ page }) => {
    await page.goto('/solicitar-acceso');
    const shownAt = Date.now();
    await page.getByRole('textbox', { name: /^Nombre/ }).focus();
    await page.keyboard.type('Teclado Prueba');
    await page.keyboard.press('Tab');
    await page.keyboard.type(`teclado+${Date.now()}@ejemplo.test`);
    await page.keyboard.press('Tab');
    await page.keyboard.type('Empresa');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Practicar objeciones');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: /política de privacidad/ })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: /política de privacidad/ })).toBeChecked();
    await page.keyboard.press('Tab'); // privacy policy link inside the label
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Enviar solicitud' })).toBeFocused();
    const wait = 3_100 - (Date.now() - shownAt);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Recibimos tu solicitud' })).toBeVisible();
  });

  test('perfil', async ({ page, loginAs }) => {
    const seller = await createSeller();
    await loginAs({ email: seller.email, password: seller.password });
    await page.goto('/perfil');
    await page.getByRole('textbox', { name: /Nombre/ }).focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Teclado Perfil');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: /Zona horaria/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Guardamos tu perfil.')).toBeVisible();
  });
});
