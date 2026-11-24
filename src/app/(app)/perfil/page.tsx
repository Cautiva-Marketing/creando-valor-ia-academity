import type { Metadata } from 'next';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileForm } from '@/features/profile/components/profile-form';
import { getProfile } from '@/features/profile/queries';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Perfil' };

const KIND_LABELS = {
  terms: 'Términos y condiciones',
  ai_notice: 'Aviso de uso de IA',
  privacy: 'Política de privacidad',
} as const;

/** Profile (H9, FR-035/FR-036): name and time zone editable; email and acceptances read-only. */
export default async function ProfilePage() {
  const profile = await getProfile();
  const displayName = profile.fullName ?? profile.email;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar userId={profile.userId} name={displayName} size="lg" />
        <div className="min-w-0">
          <h1 className="text-3xl break-words">Perfil</h1>
          <p className="text-text-muted break-words">{displayName}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Tus datos</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={profile.fullName ?? ''} timezone={profile.timezone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Cuenta</CardTitle>
          <CardDescription>Estos datos no se pueden cambiar desde aquí.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-sm text-text-muted">Correo electrónico</dt>
              <dd className="break-words" data-testid="profile-email">
                {profile.email}
              </dd>
            </div>
            {profile.acceptances.map((acceptance) => (
              <div key={acceptance.kind}>
                <dt className="text-sm text-text-muted">
                  {KIND_LABELS[acceptance.kind]} (versión {acceptance.version})
                </dt>
                <dd data-testid={`accepted-${acceptance.kind}`}>
                  Aceptado el {formatDateTime(acceptance.acceptedAt, profile.timezone)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
