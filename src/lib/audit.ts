import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

/**
 * Typed wrapper of `rpc write_audit` (data-model.md#audit-actions). Used only for events that do
 * not happen inside a SQL function (e.g. superadmin TOTP attempts before aal2). Data types never
 * allow passwords, codes, tokens or links.
 */
export interface AuditDataByAction {
  'invitation.created': {
    email_domain: string;
    expires_in_days: number;
    access_request_id?: string;
  };
  'invitation.resent': { previous_expires_at: string; expires_at: string };
  'invitation.revoked': { previous_status: string };
  'invitation.accepted': { organization_id: string; user_id: string };
  'superadmin.login': { step: 'mfa_verify' | 'mfa_enroll' };
  'superadmin.mfa_enrolled': Record<string, never>;
  'superadmin.mfa_reset': { sessions_revoked: number };
  'quota.updated': {
    before: { daily: number; monthly: number };
    after: { daily: number; monthly: number };
  };
  'organization.suspended': { reason: string };
  'organization.reactivated': { previous_reason: string | null };
  'access_request.converted': { invitation_id: string };
  'access_request.discarded': { automatic: boolean };
}

export type AuditAction = keyof AuditDataByAction;

export interface AuditEvent<A extends AuditAction> {
  action: A;
  actorType: 'user' | 'system' | 'operator';
  actorUserId?: string | null;
  actorLabel?: string | null;
  organizationId?: string | null;
  objectType: string;
  objectId?: string | null;
  data: AuditDataByAction[A];
  result?: 'success' | 'failure';
}

/** SQL NULL for optional parameters (generated types mark them as non-null strings). */
const nullable = (value: string | null | undefined) => (value ?? null) as string;

export async function writeAudit<A extends AuditAction>(event: AuditEvent<A>): Promise<void> {
  const { error } = await createAdminClient().rpc('write_audit', {
    p_actor_type: event.actorType,
    p_actor_user_id: nullable(event.actorUserId),
    p_actor_label: nullable(event.actorLabel),
    p_org: nullable(event.organizationId),
    p_action: event.action,
    p_object_type: event.objectType,
    p_object_id: nullable(event.objectId),
    p_data: event.data as unknown as Json,
    p_result: event.result ?? 'success',
  });
  if (error) throw new Error(`audit write failed (${error.code})`);
}
