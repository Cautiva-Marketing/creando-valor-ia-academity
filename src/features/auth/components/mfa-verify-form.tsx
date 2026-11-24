'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { verifyMfa } from '../mfa-actions';
import { TotpCodeField } from './totp-code-field';

export function MfaVerifyForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyMfa, null);
  const failure = state && !state.ok ? state : null;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {failure && !failure.fieldErrors ? <FormAlert>{failure.message}</FormAlert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TotpCodeField errors={failure?.fieldErrors?.code} />
      <Button type="submit" size="lg" loading={pending} loadingLabel="Verificando…">
        Verificar
      </Button>
    </form>
  );
}
