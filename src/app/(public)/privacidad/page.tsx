import type { Metadata } from 'next';
import { LegalDocumentView } from '@/features/legal/components/legal-document';
import { getCurrentLegalDocument } from '@/features/legal/queries';

export const metadata: Metadata = { title: 'Política de privacidad' };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  return (
    <LegalDocumentView
      title="Política de privacidad"
      document={await getCurrentLegalDocument('privacy')}
    />
  );
}
