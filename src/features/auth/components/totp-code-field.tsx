'use client';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

/** 6-digit TOTP input: numeric keyboard and one-time-code autofill. */
export function TotpCodeField({ errors }: { errors?: string[] }) {
  return (
    <FormField
      id="code"
      label="Código de 6 dígitos"
      description="Ábrelo en tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…)."
      errors={errors}
      required
    >
      {(control) => (
        <Input
          {...control}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          className="max-w-48 font-mono text-xl tracking-widest"
        />
      )}
    </FormField>
  );
}
