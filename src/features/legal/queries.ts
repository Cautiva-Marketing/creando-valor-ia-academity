import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env.public';
import type { Database } from '@/lib/supabase/database.types';

export type LegalKind = Database['public']['Enums']['legal_document_kind'];

export interface LegalDocument {
  id: string;
  kind: LegalKind;
  version: string;
  effectiveAt: string;
  isDraft: boolean;
  content: string;
}

/** Anonymous, cookie-less client: legal documents are public (RLS select to anon). */
function publicClient() {
  const env = publicEnv();
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

const CONTENT_PATH = /^content\/legal\/([a-z0-9._-]+\.md)$/;

async function readContent(contentPath: string): Promise<string> {
  // Defense in depth: the CHECK constraint already restricts the path format. The directory is
  // static so the bundler traces only content/legal (next.config outputFileTracingIncludes).
  const fileName = CONTENT_PATH.exec(contentPath)?.[1];
  if (!fileName) throw new Error('invalid legal content path');
  return readFile(path.join(process.cwd(), 'content', 'legal', fileName), 'utf8');
}

/**
 * Current document of each kind: greatest `effective_at <= now()` (FR-015). Its `id` is what the
 * activation and access-request forms send as hidden fields.
 */
export async function getCurrentLegalDocuments(): Promise<Record<LegalKind, LegalDocument | null>> {
  const { data, error } = await publicClient()
    .from('legal_documents')
    .select('id, kind, version, effective_at, is_draft, content_path')
    .lte('effective_at', new Date().toISOString())
    .order('effective_at', { ascending: false });
  if (error) throw new Error(`legal documents read failed (${error.code})`);

  const current: Record<LegalKind, LegalDocument | null> = {
    terms: null,
    ai_notice: null,
    privacy: null,
  };
  for (const row of data ?? []) {
    if (current[row.kind]) continue;
    current[row.kind] = {
      id: row.id,
      kind: row.kind,
      version: row.version,
      effectiveAt: row.effective_at,
      isDraft: row.is_draft,
      content: await readContent(row.content_path),
    };
  }
  return current;
}

export async function getCurrentLegalDocument(kind: LegalKind): Promise<LegalDocument | null> {
  return (await getCurrentLegalDocuments())[kind];
}
