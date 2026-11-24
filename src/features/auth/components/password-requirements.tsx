'use client';

import { Check, Circle } from 'lucide-react';
import { evaluatePasswordRequirements } from '@/lib/security/password-rules';
import { cn } from '@/lib/utils';

/**
 * Real-time password requirements (FR-014). The server also rejects common and breached
 * passwords; that check is announced after submitting.
 */
export function PasswordRequirements({
  id,
  password,
  email,
}: {
  id: string;
  password: string;
  email?: string;
}) {
  const requirements = evaluatePasswordRequirements(password, email);
  return (
    <div id={id} className="flex flex-col gap-1 text-sm">
      <ul className="flex flex-col gap-1" aria-live="polite">
        {requirements.map((req) => (
          <li
            key={req.id}
            className={cn('flex items-center gap-2', req.met ? 'text-success' : 'text-text-muted')}
          >
            {req.met ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Circle className="size-4" aria-hidden="true" />
            )}
            <span>
              {req.label}
              <span className="sr-only">{req.met ? ': cumplido' : ': pendiente'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-text-muted">Evita contraseñas comunes o filtradas en otros sitios.</p>
    </div>
  );
}
