import { createClient } from '@supabase/supabase-js';
import { testEnv } from './fixtures/env';
import { uniqueEmail } from './fixtures/factories';
import { expect, test } from './fixtures/test';

test.describe('US3 · sin registro abierto (FR-022)', () => {
  test('no existe UI de registro', async ({ page }) => {
    for (const path of ['/', '/iniciar-sesion']) {
      await page.goto(path);
      await expect(
        page.getByRole('link', { name: /regístrate|registrarse|crear cuenta/i }),
      ).toHaveCount(0);
    }
    for (const path of ['/registro', '/registrarse', '/signup']) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });

  test('auth.signUp con la clave publicable es rechazado', async () => {
    const supabase = createClient(
      testEnv('NEXT_PUBLIC_SUPABASE_URL'),
      testEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      {
        auth: { persistSession: false },
      },
    );
    const { data, error } = await supabase.auth.signUp({
      email: uniqueEmail('registro'),
      password: 'Registro-Abierto-2026',
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});
