'use server';

import { revalidatePath } from 'next/cache';
import InvitationEmail, { INVITATION_SUBJECT } from '@/emails/invitation';
import { fail, fromPostgresError, ok, unexpected, type ActionResult } from '@/lib/action-result';
import type { RequestContext } from '@/lib/auth/context-types';
import { actionRequireSuperadmin } from '@/lib/auth/guards';
import { EmailSendError, sendEmail } from '@/lib/email/send';
import { publicEnv } from '@/lib/env.public';
import { generateToken, hashTokenHex } from '@/lib/security/tokens';
import { createClient, type ServerSupabase } from '@/lib/supabase/server';
import { fieldErrorsOf, formValues } from '@/features/auth/schemas';
import { createInvitationSchema, resendInvitationSchema, revokeInvitationSchema } from './schemas';
import { invitationStatusOf } from './queries';

/**
 * Invitation Server Actions (contracts/server-actions.md → Administración). Order: auth →
 * user_mutation → Zod → aal2 → SQL (which re-checks, mutates and audits) → email → revalidate.
 */

export interface InvitationResult {
  invitationId: string;
  sendStatus: 'pending' | 'sent' | 'failed';
  duplicate?: true;
}

const LIST_PATH = '/admin/invitaciones';
const nullable = <T>(value: T | null | undefined) => (value ?? null) as T;

function acceptUrl(token: string): string {
  return new URL(`/invitacion/${token}`, publicEnv().NEXT_PUBLIC_SITE_URL).toString();
}

/** Sends the invitation email and records the result; never throws for SMTP errors. */
async function deliver(
  supabase: ServerSupabase,
  ctx: RequestContext,
  invitation: { id: string; email: string; expiresAt: string; expiresInDays: number },
  token: string,
): Promise<'sent' | 'failed'> {
  let sent = true;
  try {
    await sendEmail({
      to: invitation.email,
      subject: INVITATION_SUBJECT,
      react: InvitationEmail({
        inviterName: ctx.full_name?.trim() || 'El equipo de Cautiva',
        acceptUrl: acceptUrl(token),
        expiresAt: new Date(invitation.expiresAt),
        expiresInDays: invitation.expiresInDays,
      }),
    });
  } catch (error) {
    if (!(error instanceof EmailSendError)) throw error;
    sent = false;
  }
  const { error } = await supabase.rpc('admin_mark_invitation_sent', {
    p_id: invitation.id,
    p_ok: sent,
  });
  if (error) throw new Error(`admin_mark_invitation_sent failed (${error.code})`);
  return sent ? 'sent' : 'failed';
}

async function readInvitation(supabase: ServerSupabase, id: string) {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, expires_at, expires_in_days, send_status, accepted_at, revoked_at')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`invitation read failed (${error?.code ?? 'no data'})`);
  return data;
}

export async function createInvitation(
  _prev: ActionResult<InvitationResult> | null,
  formData: FormData,
): Promise<ActionResult<InvitationResult>> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const raw = formValues(formData, ['email', 'expiresInDays', 'accessRequestId', 'idempotencyKey']);
  const values = { email: raw.email ?? '', expiresInDays: raw.expiresInDays ?? '7' };
  const parsed = createInvitationSchema.safeParse(raw);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });

  try {
    const supabase = await createClient();
    const token = generateToken();
    const { data, error } = await supabase
      .rpc('admin_create_invitation', {
        p_email: parsed.data.email,
        p_days: parsed.data.expiresInDays,
        p_token_hash: hashTokenHex(token),
        p_access_request_id: nullable(parsed.data.accessRequestId),
        p_idempotency_key: parsed.data.idempotencyKey,
      })
      .single();

    if (error) {
      if (error.code === 'P0012') {
        if (error.details?.startsWith('open_invitation:')) {
          const existingId = error.details.slice('open_invitation:'.length);
          const existing = await readInvitation(supabase, existingId);
          return fail('conflict', {
            message: 'Ya hay una invitación abierta para ese correo. Puedes reenviarla.',
            details: {
              reason: 'open_invitation',
              invitationId: existingId,
              status: invitationStatusOf(existing),
            },
            values,
          });
        }
        return fail('conflict', {
          message: 'Ya existe una cuenta activa con ese correo.',
          details: { reason: 'account_exists' },
          values,
        });
      }
      return { ...fromPostgresError(error, 'createInvitation'), values };
    }

    const invitation = await readInvitation(supabase, data.invitation_id);
    if (data.duplicate) {
      return ok({
        invitationId: invitation.id,
        sendStatus: invitation.send_status,
        duplicate: true,
      });
    }
    const sendStatus = await deliver(
      supabase,
      auth.ctx,
      {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expires_at,
        expiresInDays: invitation.expires_in_days,
      },
      token,
    );
    revalidatePath(LIST_PATH);
    // A converted access request leaves the inbox and the navigation badge.
    if (parsed.data.accessRequestId) revalidatePath('/', 'layout');
    return ok({ invitationId: invitation.id, sendStatus });
  } catch (error) {
    return { ...unexpected(error, 'createInvitation'), values };
  }
}

/** Resend and "Reintentar envío" (one idempotency key per confirmation dialog). */
export async function resendInvitation(input: {
  invitationId: string;
  idempotencyKey: string;
}): Promise<ActionResult<InvitationResult>> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const parsed = resendInvitationSchema.safeParse(input);
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

  try {
    const supabase = await createClient();
    const token = generateToken();
    const { data, error } = await supabase
      .rpc('admin_resend_invitation', {
        p_invitation_id: parsed.data.invitationId,
        p_token_hash: hashTokenHex(token),
        p_idempotency_key: parsed.data.idempotencyKey,
      })
      .single();
    if (error) {
      if (error.code === 'P0010') {
        return fail('conflict', {
          message: 'Esta invitación ya fue aceptada o revocada y no puede reenviarse.',
        });
      }
      return fromPostgresError(error, 'resendInvitation');
    }
    const invitation = await readInvitation(supabase, data.invitation_id);
    if (data.duplicate) {
      return ok({
        invitationId: invitation.id,
        sendStatus: invitation.send_status,
        duplicate: true,
      });
    }
    const sendStatus = await deliver(
      supabase,
      auth.ctx,
      {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expires_at,
        expiresInDays: invitation.expires_in_days,
      },
      token,
    );
    revalidatePath(LIST_PATH);
    return ok({ invitationId: invitation.id, sendStatus });
  } catch (error) {
    return unexpected(error, 'resendInvitation');
  }
}

export async function revokeInvitation(input: {
  invitationId: string;
}): Promise<ActionResult<{ invitationId: string; duplicate?: true }>> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const parsed = revokeInvitationSchema.safeParse(input);
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc('admin_revoke_invitation', { p_id: parsed.data.invitationId })
      .single();
    if (error) {
      if (error.code === 'P0010') {
        return fail('conflict', {
          message: 'Esta invitación ya fue aceptada y no puede revocarse.',
        });
      }
      return fromPostgresError(error, 'revokeInvitation');
    }
    revalidatePath(LIST_PATH);
    return ok(
      data.duplicate
        ? { invitationId: data.invitation_id, duplicate: true as const }
        : { invitationId: data.invitation_id },
    );
  } catch (error) {
    return unexpected(error, 'revokeInvitation');
  }
}
