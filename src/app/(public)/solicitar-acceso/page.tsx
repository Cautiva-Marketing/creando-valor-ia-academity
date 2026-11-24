import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { AccessRequestForm } from '@/features/access-requests/components/access-request-form';
import { getCurrentLegalDocuments } from '@/features/legal/queries';
import { signedFormStart } from '@/lib/security/hmac';

export const metadata: Metadata = { title: 'Solicitar acceso' };
export const dynamic = 'force-dynamic';

/** Public access request (H10, FR-048/049): signed start time and current privacy version per render. */
export default async function RequestAccessPage() {
  const privacy = (await getCurrentLegalDocuments()).privacy;
  const startedAt = signedFormStart();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl sm:text-4xl">Solicitar acceso</h1>
        <p className="text-text-muted">
          Cuéntanos quién eres. Revisaremos tu solicitud y, si es aprobada, recibirás una invitación
          por correo. ¿Ya tienes cuenta?{' '}
          <Link href="/iniciar-sesion" className="text-primary underline underline-offset-4">
            Inicia sesión
          </Link>
          .
        </p>
      </div>
      {privacy ? (
        <AccessRequestForm startedAt={startedAt} privacyDocumentId={privacy.id} />
      ) : (
        <EmptyState
          title="Solicitudes no disponibles"
          description="Vuelve a intentarlo más tarde."
        />
      )}
    </div>
  );
}
