import type { Metadata } from 'next';
import { LegalDocumentView } from '@/features/legal/components/legal-document';
import { getCurrentLegalDocument } from '@/features/legal/queries';

export const metadata: Metadata = { title: 'Términos de uso' };
export const dynamic = 'force-dynamic';

export default async function TermsPage() {
  return (
    <LegalDocumentView title="Términos de uso" document={await getCurrentLegalDocument('terms')} />
  );
}
