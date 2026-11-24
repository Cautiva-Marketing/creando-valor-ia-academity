'use client';

import { Check, Copy } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { ErrorState } from '@/components/states/error-state';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { ActionResult } from '@/lib/action-result';
import { confirmMfaEnrollment, enrollMfa, type EnrollmentData } from '../mfa-actions';
import { TotpCodeField } from './totp-code-field';

export function MfaEnrollForm() {
  const [enrollment, setEnrollment] = useState<ActionResult<EnrollmentData> | null>(null);
  const [starting, startEnrollment] = useTransition();
  const [state, action, pending] = useActionState(confirmMfaEnrollment, null);
  const [copied, setCopied] = useState(false);
  const failure = state && !state.ok ? state : null;

  const start = () => startEnrollment(async () => setEnrollment(await enrollMfa()));
  useEffect(start, []);

  if (!enrollment || starting) {
    return (
      <div aria-busy="true" className="flex flex-col items-center gap-4">
        <span className="sr-only">Generando tu código QR…</span>
        <Skeleton className="size-48" />
        <Skeleton className="h-6 w-64" />
      </div>
    );
  }
  if (!enrollment.ok) {
    return (
      <ErrorState
        title="No pudimos generar el código QR"
        referenceId={enrollment.referenceId}
        onRetry={start}
      />
    );
  }

  const { factorId, qrSvg, secret } = enrollment.data;
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>Abre tu app de autenticación y agrega una cuenta nueva.</li>
        <li>Escanea el código QR o escribe la clave manual.</li>
        <li>Escribe el código de 6 dígitos que muestra la app.</li>
      </ol>
      <div className="flex flex-col items-center gap-3">
        {/* QR from Supabase Auth as an SVG data URL; white background keeps it scannable in dark mode. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSvg}
          alt="Código QR para agregar Creando Valor IA a tu app de autenticación. Si no puedes escanearlo, usa la clave manual."
          className="size-48 rounded-md bg-surface-raised p-2 ring-1 ring-border"
        />
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-sm text-text-muted" id="clave-manual-label">
            Clave manual
          </p>
          <code
            aria-labelledby="clave-manual-label"
            className="rounded-md bg-surface-sunken px-3 py-2 text-center font-mono text-base break-all"
            data-testid="totp-secret"
          >
            {grouped}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(secret);
              setCopied(true);
            }}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Clave copiada' : 'Copiar clave'}
          </Button>
          <span className="sr-only" aria-live="polite">
            {copied ? 'Clave copiada al portapapeles' : ''}
          </span>
        </div>
      </div>
      <form action={action} noValidate className="flex flex-col gap-5">
        {failure && !failure.fieldErrors ? <FormAlert>{failure.message}</FormAlert> : null}
        <input type="hidden" name="factorId" value={factorId} />
        <TotpCodeField errors={failure?.fieldErrors?.code} />
        <Button type="submit" size="lg" loading={pending} loadingLabel="Verificando…">
          Activar verificación en dos pasos
        </Button>
      </form>
    </div>
  );
}
