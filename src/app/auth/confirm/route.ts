import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { authConfirmParams } from '@/features/auth/schemas';
import { createClient } from '@/lib/supabase/server';

/**
 * Recovery link target (contracts/routes.md): the query is validated with Zod BEFORE calling Auth.
 * Invalid parameters or an invalid/expired/used link → /recuperar-contrasena?estado=enlace-invalido.
 */
export const dynamic = 'force-dynamic';

const INVALID = '/recuperar-contrasena?estado=enlace-invalido';

export async function GET(request: NextRequest) {
  const parsed = authConfirmParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) redirect(INVALID);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: 'recovery',
    token_hash: parsed.data.token_hash,
  });
  if (error) redirect(INVALID);
  redirect('/restablecer-contrasena');
}
