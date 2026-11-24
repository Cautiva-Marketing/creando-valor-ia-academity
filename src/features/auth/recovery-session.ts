import 'server-only';
import type { ServerSupabase } from '@/lib/supabase/server';

const RECOVERY_WINDOW_SECONDS = 60 * 60;

/**
 * GoTrue records `otp` in `amr` for verifyOtp(token_hash, type=recovery) (verified locally, Supabase
 * CLI 3.3). Signup, magic links and email OTP sign-in are disabled in this product, so an `otp`
 * entry can only come from a recovery link; `recovery` is accepted for older GoTrue versions.
 */
const RECOVERY_METHODS = new Set(['otp', 'recovery']);

/**
 * True when the current session was obtained through a recovery link less than 60 minutes ago.
 */
export async function isRecoverySession(supabase: ServerSupabase): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims as { amr?: { method: string; timestamp: number }[] } | undefined)?.amr;
  const recovery = amr?.find((entry) => RECOVERY_METHODS.has(entry.method));
  if (!recovery) return false;
  return Date.now() / 1000 - recovery.timestamp < RECOVERY_WINDOW_SECONDS;
}
