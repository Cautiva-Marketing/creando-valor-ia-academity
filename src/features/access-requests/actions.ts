'use server';

import { revalidatePath } from 'next/cache';
import {
  fail,
  fromPostgresError,
  ok,
  rateLimited,
  unexpected,
  type ActionResult,
} from '@/lib/action-result';
import { actionRequireSuperadmin } from '@/lib/auth/guards';
import { verifySignedTimestamp } from '@/lib/security/hmac';
import { checkRateLimit, getClientIp, recordRateLimitEvent } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsOf, formValues } from '@/features/auth/schemas';
import { getCurrentLegalDocuments } from '@/features/legal/queries';
import {
  MIN_FILL_MS,
  PRIVACY_UPDATED_MESSAGE,
  discardAccessRequestSchema,
  submitAccessRequestSchema,
} from './schemas';

const FIELDS = [
  'fullName',
  'email',
  'companyOrRole',
  'message',
  'acceptPrivacy',
  'privacyDocumentId',
  'website',
  'startedAt',
] as const;

/**
 * Public access request (contracts/server-actions.md, research.md §R12). Order: per-IP rate limit
 * check → Zod → anti-abuse (honeypot, signed ≥ 3 s) → current privacy version → INSERT with the admin
 * client. Success and duplicate return the same confirmation (existence is never revealed).
 */
export async function submitAccessRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formValues(formData, FIELDS);
  // Typed text comes back on errors; anti-abuse fields and the checkbox do not.
  const values = {
    fullName: raw.fullName ?? '',
    email: raw.email ?? '',
    companyOrRole: raw.companyOrRole ?? '',
    message: raw.message ?? '',
  };

  try {
    const ip = await getClientIp();
    const limit = await checkRateLimit('access_request_ip', ip);
    if (!limit.allowed) return { ...rateLimited(limit.retryAfterSeconds), values };

    // formValues drops empty strings; an empty honeypot is the expected human value.
    const parsed = submitAccessRequestSchema.safeParse({ ...raw, website: raw.website ?? '' });
    if (!parsed.success) {
      // A filled honeypot or a malformed timestamp is a bot: same confirmation, nothing stored.
      const fields = fieldErrorsOf(parsed.error);
      if (fields.website || fields.startedAt) return ok();
      return fail('validation', { fieldErrors: fields, values });
    }
    const input = parsed.data;

    const startedAt = verifySignedTimestamp(input.startedAt);
    if (startedAt === null) return ok();
    if (Date.now() - startedAt < MIN_FILL_MS) {
      return fail('validation', {
        message: 'Revisa tus datos un momento y vuelve a enviar la solicitud.',
        values,
      });
    }

    await recordRateLimitEvent('access_request_ip', ip);

    const current = (await getCurrentLegalDocuments()).privacy;
    if (!current || current.id !== input.privacyDocumentId) {
      return fail('validation', {
        fieldErrors: { acceptPrivacy: [PRIVACY_UPDATED_MESSAGE] },
        values,
        ...(current ? { details: { privacyDocumentId: current.id } } : {}),
      });
    }

    const { error } = await createAdminClient()
      .from('access_requests')
      .insert({
        full_name: input.fullName,
        email: input.email,
        company_or_role: input.companyOrRole ?? null,
        message: input.message ?? null,
        privacy_document_id: input.privacyDocumentId,
        privacy_accepted_at: new Date().toISOString(),
      });
    // 23505: an open (`new`) request already exists for this email → same confirmation.
    if (error && error.code !== '23505')
      return { ...unexpected(error, 'submitAccessRequest'), values };
    if (!error) revalidatePath('/admin/solicitudes');
    return ok();
  } catch (error) {
    return { ...unexpected(error, 'submitAccessRequest'), values };
  }
}

/** Manual discard (S2): only from `new`; the SQL function audits it. */
export async function discardAccessRequest(input: {
  accessRequestId: string;
}): Promise<ActionResult> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const parsed = discardAccessRequestSchema.safeParse(input);
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_discard_access_request', {
      p_id: parsed.data.accessRequestId,
    });
    if (error) {
      if (error.code === 'P0010')
        return fail('conflict', { message: 'Esta solicitud ya no está nueva.' });
      return fromPostgresError(error, 'discardAccessRequest');
    }
    // The layout holds the "new requests" badge.
    revalidatePath('/', 'layout');
    return ok();
  } catch (error) {
    return unexpected(error, 'discardAccessRequest');
  }
}
