import { randomUUID } from 'node:crypto';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { getConvertibleAccessRequest } from '@/features/access-requests/queries';
import { CreateInvitationForm } from '@/features/invitations/components/create-invitation-form';
import { convertibleRequestParam } from '@/features/invitations/schemas';
import { requireSuperadmin } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Nueva invitación' };
export const dynamic = 'force-dynamic';

/**
 * A fresh idempotency key per rendered form (contracts/server-actions.md → createInvitation).
 * `?solicitud=<uuid>` preloads the email of a convertible access request and links it.
 */
export default async function NewInvitationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadmin('/admin/invitaciones/nueva');
  const idempotencyKey = randomUUID();
  const { solicitud } = await searchParams;

  let request: { id: string; email: string } | null = null;
  let requestNotice = false;
  if (solicitud !== undefined) {
    const parsed = convertibleRequestParam.safeParse(solicitud);
    request = parsed.success ? await getConvertibleAccessRequest(parsed.data) : null;
    requestNotice = request === null;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href={request || requestNotice ? '/admin/solicitudes' : '/admin/invitaciones'}
        className="inline-flex min-h-touch items-center gap-2 self-start text-primary underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {request || requestNotice ? 'Volver a solicitudes' : 'Volver a invitaciones'}
      </Link>
      {requestNotice ? (
        <FormAlert tone="info" title="Solicitud no disponible">
          La solicitud ya no está disponible para convertir (fue invitada, descartada o no existe).
          Puedes crear la invitación sin vincularla.
        </FormAlert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            Nueva invitación
          </CardTitle>
          <CardDescription>
            {request
              ? 'Invitación a partir de una solicitud de acceso: el correo viene de la solicitud.'
              : 'La persona recibirá un correo con un enlace para activar su cuenta y su organización personal.'}
          </CardDescription>
        </CardHeader>
        <CreateInvitationForm
          idempotencyKey={idempotencyKey}
          defaultEmail={request?.email}
          accessRequestId={request?.id}
        />
      </Card>
    </div>
  );
}
