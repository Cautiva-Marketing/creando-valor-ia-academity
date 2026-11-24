import { LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { publicEnv } from '@/lib/env.public';

export type InvalidInvitationReason = 'expired' | 'revoked' | 'used' | 'invalid' | 'rate_limited';

const COPY: Record<InvalidInvitationReason, { title: string; body: string }> = {
  expired: {
    title: 'Esta invitación venció',
    body: 'El enlace ya no es válido. Pide al equipo de Cautiva que te envíe una invitación nueva.',
  },
  revoked: {
    title: 'Esta invitación fue revocada',
    body: 'El enlace ya no es válido. Si crees que es un error, pide al equipo de Cautiva una invitación nueva.',
  },
  used: {
    title: 'Esta invitación ya fue usada',
    body: 'Tu cuenta ya está activa. Inicia sesión con tu correo y contraseña.',
  },
  invalid: {
    title: 'Este enlace no es válido',
    body: 'Revisa que copiaste el enlace completo del correo o pide al equipo de Cautiva una invitación nueva.',
  },
  rate_limited: {
    title: 'Demasiados intentos',
    body: 'Por seguridad pausamos los intentos desde tu conexión.',
  },
};

/** Message per cause and how to ask for another invitation (AC-02). */
export function InvalidInvitation({
  reason,
  retryMessage,
}: {
  reason: InvalidInvitationReason;
  retryMessage?: string;
}) {
  const copy = COPY[reason];
  const support = publicEnv().NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <section
      aria-labelledby="invitacion-invalida"
      className="flex flex-col items-center gap-4 text-center"
    >
      <span
        className="flex size-12 items-center justify-center rounded-full bg-surface-sunken"
        aria-hidden="true"
      >
        <LinkIcon className="size-6 text-text-muted" />
      </span>
      <h1 id="invitacion-invalida" className="text-2xl">
        {copy.title}
      </h1>
      <p className="text-text-muted">{copy.body}</p>
      {retryMessage ? <p role="status">{retryMessage}</p> : null}
      {reason === 'used' ? (
        <Button asChild size="lg">
          <Link href="/iniciar-sesion">Iniciar sesión</Link>
        </Button>
      ) : reason !== 'rate_limited' ? (
        <p className="text-sm text-text-muted">
          Escríbenos a{' '}
          <a href={`mailto:${support}`} className="text-primary underline underline-offset-4">
            {support}
          </a>
          .
        </p>
      ) : null}
    </section>
  );
}
