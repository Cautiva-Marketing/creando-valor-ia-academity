import type { Metadata } from 'next';
import { LegalDocumentView } from '@/features/legal/components/legal-document';
import { getCurrentLegalDocument } from '@/features/legal/queries';

export const metadata: Metadata = { title: 'Aviso de uso de IA' };
export const dynamic = 'force-dynamic';

export default async function AiNoticePage() {
  return (
    <LegalDocumentView
      title="Aviso de uso de IA"
      document={await getCurrentLegalDocument('ai_notice')}
    />
  );
}
