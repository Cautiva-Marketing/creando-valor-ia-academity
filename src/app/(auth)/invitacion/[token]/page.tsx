import type { Metadata } from 'next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivationForm } from '@/features/invitations/components/activation-form';
import { InvalidInvitation } from '@/features/invitations/components/invalid-invitation';
import { getInvitationForToken } from '@/features/invitations/queries';
import { getCurrentLegalDocuments } from '@/features/legal/queries';
import { retryMessage } from '@/lib/action-result';

export const metadata: Metadata = { title: 'Activa tu cuenta', referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/** `/invitacion/[token]` (contracts/routes.md): token validated by Zod before any query. */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationForToken(token);

  if (invitation.status === 'rate_limited') {
    return (
      <InvalidInvitation
        reason="rate_limited"
        retryMessage={retryMessage(invitation.retryAfterSeconds)}
      />
    );
  }
  if (invitation.status !== 'pending') {
    return (
      <InvalidInvitation reason={invitation.status === 'accepted' ? 'used' : invitation.status} />
    );
  }

  const legal = await getCurrentLegalDocuments();
  if (!legal.terms || !legal.ai_notice) throw new Error('current legal documents missing');

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          Activa tu cuenta
        </CardTitle>
        <CardDescription>
          Completa tus datos para empezar a practicar en Creando Valor IA™.
        </CardDescription>
      </CardHeader>
      <ActivationForm
        token={token}
        email={invitation.email}
        termsDocumentId={legal.terms.id}
        aiNoticeDocumentId={legal.ai_notice.id}
      />
    </Card>
  );
}
