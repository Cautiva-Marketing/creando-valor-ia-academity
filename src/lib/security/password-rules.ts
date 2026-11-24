/**
 * Client-safe mirror of the password policy (research.md §R6) for the live requirements indicator.
 * The server (`password-policy.ts`) is authoritative and also checks the common list and HIBP.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordIssue = 'too_short' | 'too_long' | 'same_as_email' | 'common' | 'pwned';

export const PASSWORD_ISSUE_MESSAGES: Record<PasswordIssue, string> = {
  too_short: `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  too_long: `Usa como máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  same_as_email: 'No uses tu correo ni la parte anterior a la @.',
  common: 'Es una contraseña demasiado común. Elige otra.',
  pwned: 'Esta contraseña apareció en filtraciones de datos. Elige otra.',
};

export interface PasswordRequirement {
  id: 'length' | 'not_email';
  label: string;
  met: boolean;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** True when the password equals the email or its local part (normalized comparison). */
export function matchesEmail(password: string, email: string | undefined): boolean {
  if (!email) return false;
  const normalizedEmail = normalize(email);
  const localPart = normalizedEmail.split('@')[0] ?? '';
  const candidate = normalize(password);
  return candidate === normalizedEmail || (localPart.length > 0 && candidate === localPart);
}

/** Requirements shown in real time (no network, no common list in the client). */
export function evaluatePasswordRequirements(
  password: string,
  email?: string,
): PasswordRequirement[] {
  return [
    {
      id: 'length',
      label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'not_email',
      label: 'Distinta de tu correo',
      met: password.length > 0 && !matchesEmail(password, email),
    },
  ];
}

/** Local, synchronous issues (length and email). */
export function basicPasswordIssues(password: string, email?: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push('too_short');
  if (password.length > PASSWORD_MAX_LENGTH) issues.push('too_long');
  if (matchesEmail(password, email)) issues.push('same_as_email');
  return issues;
}
