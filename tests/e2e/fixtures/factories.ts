import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/lib/supabase/database.types';
import { testEnv } from './env';
import { SEED_USERS } from './seed-data';
import { freshTotp } from './totp';

/**
 * TEST-ONLY factories (tasks.md → "Regla de datos e2e"): every test that mutates state creates its
 * own rows here, with unique emails `<prefix>+<uuid>@ejemplo.test` and unique org names. Uses the
 * secret key, so it never runs in the app bundle. Never creates `ai_usage` rows.
 */
type Admin = SupabaseClient<Database>;
type OrgRole = Database['public']['Enums']['org_role'];
type OnboardingStatus = Database['public']['Enums']['onboarding_status'];

export const FACTORY_PASSWORD = 'Prueba-Segura-2026!';

let cached: Admin | undefined;
export function adminClient(): Admin {
  cached ??= createClient<Database>(
    testEnv('NEXT_PUBLIC_SUPABASE_URL'),
    testEnv('SUPABASE_SECRET_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}

function anonClient(): Admin {
  return createClient<Database>(
    testEnv('NEXT_PUBLIC_SUPABASE_URL'),
    testEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type Result = { data: unknown; error: { message: string } | null };

/** Unwraps a Supabase result, keeping the type of its success branch. */
function must<R extends Result>(
  result: R,
  what: string,
): NonNullable<Extract<R, { error: null }>['data']> {
  if (result.error || result.data == null)
    throw new Error(`factory ${what}: ${result.error?.message ?? 'no data'}`);
  return result.data as NonNullable<Extract<R, { error: null }>['data']>;
}

export function uniqueEmail(prefix = 'prueba'): string {
  return `${prefix}+${randomUUID()}@ejemplo.test`;
}

function shortId(): string {
  return randomUUID().slice(0, 8);
}

/** Known invitation token (43 chars base64url) and its sha256 as a bytea literal. */
export function newInvitationToken(): { token: string; tokenHashHex: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHashHex: `\\x${createHash('sha256').update(token).digest('hex')}` };
}

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
}

export async function createUser({
  prefix = 'prueba',
  fullName = `Persona ${shortId()}`,
  password = FACTORY_PASSWORD,
  onboardingStatus = 'completed',
  timezone = 'America/Lima',
}: {
  prefix?: string;
  fullName?: string | null;
  password?: string;
  onboardingStatus?: OnboardingStatus;
  timezone?: string;
} = {}): Promise<CreatedUser> {
  const admin = adminClient();
  const email = uniqueEmail(prefix);
  const { user } = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'createUser',
  );
  must(
    await admin
      .from('profiles')
      .update({
        full_name: fullName,
        onboarding_status: onboardingStatus,
        onboarding_step: onboardingStatus === 'completed' ? 3 : 1,
        timezone,
      })
      .eq('user_id', user.id)
      .select('user_id')
      .single(),
    'profile',
  );
  return { id: user.id, email, password, fullName: fullName ?? '' };
}

export interface CreatedSeller extends CreatedUser {
  orgId: string;
  orgName: string;
}

/** Seller with a personal organization, quota and membership. */
export async function createSeller({
  prefix = 'vendedor',
  orgStatus = 'active',
  membershipStatus = 'active',
  roles = ['vendedor'],
  ...userOptions
}: Parameters<typeof createUser>[0] & {
  orgStatus?: 'active' | 'suspended';
  membershipStatus?: 'active' | 'suspended' | 'invited';
  roles?: OrgRole[];
} = {}): Promise<CreatedSeller> {
  const admin = adminClient();
  const user = await createUser({ prefix, ...userOptions });
  const suffix = shortId();
  const orgName = `${user.fullName || 'Vendedor'} ${suffix}`.slice(0, 120);
  const org = must(
    await admin
      .from('organizations')
      .insert({
        type: 'personal',
        name: orgName,
        slug: `org-${suffix}-${shortId()}`,
        timezone: 'America/Lima',
        status: orgStatus,
        suspended_reason: orgStatus === 'suspended' ? 'Suspensión de prueba (e2e)' : null,
        suspended_at: orgStatus === 'suspended' ? new Date().toISOString() : null,
        suspended_by: orgStatus === 'suspended' ? SEED_USERS.superadmin.id : null,
      })
      .select('id')
      .single(),
    'organization',
  );
  must(
    await admin
      .from('memberships')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        roles,
        status: membershipStatus,
        invited_at: new Date().toISOString(),
        joined_at: membershipStatus === 'invited' ? null : new Date().toISOString(),
      })
      .select('id')
      .single(),
    'membership',
  );
  must(
    await admin
      .from('quotas')
      .insert({ organization_id: org.id })
      .select('organization_id')
      .single(),
    'quota',
  );
  return { ...user, orgId: org.id, orgName };
}

export interface CreatedSuperadmin extends CreatedUser {
  totpSecret: string | null;
  factorId: string | null;
}

/** Superadmin with or without a verified TOTP factor of known secret. */
export async function createSuperadmin({
  withFactor = true,
  timezone = 'America/Lima',
}: { withFactor?: boolean; timezone?: string } = {}): Promise<CreatedSuperadmin> {
  const admin = adminClient();
  const user = await createUser({
    prefix: 'superadmin',
    fullName: `Superadmin ${shortId()}`,
    timezone,
  });
  must(
    await admin
      .from('platform_admins')
      .insert({ user_id: user.id, created_by_label: 'e2e' })
      .select('user_id')
      .single(),
    'platform_admin',
  );
  if (!withFactor) return { ...user, totpSecret: null, factorId: null };

  const client = anonClient();
  must(
    await client.auth.signInWithPassword({ email: user.email, password: user.password }),
    'signIn',
  );
  const enrolled = must(
    await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' }),
    'enroll',
  );
  const code = await freshTotp(enrolled.totp.secret);
  must(await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code }), 'verify factor');
  await client.auth.signOut({ scope: 'local' });
  return { ...user, totpSecret: enrolled.totp.secret, factorId: enrolled.id };
}

export type InvitationState = 'pending' | 'accepted' | 'expired' | 'revoked' | 'send_failed';

export interface CreatedInvitation {
  id: string;
  email: string;
  token: string;
  acceptedUser?: CreatedSeller;
}

/** Invitation in any state with a known token. */
export async function createInvitation({
  state = 'pending',
  email = uniqueEmail('invitacion'),
  expiresInDays = 7,
  accessRequestId,
}: {
  state?: InvitationState;
  email?: string;
  expiresInDays?: number;
  accessRequestId?: string;
} = {}): Promise<CreatedInvitation> {
  const admin = adminClient();
  const { token, tokenHashHex } = newInvitationToken();
  const now = Date.now();
  const day = 86_400_000;
  const acceptedUser =
    state === 'accepted' ? await createSeller({ prefix: 'aceptada' }) : undefined;
  const row = must(
    await admin
      .from('invitations')
      .insert({
        email: acceptedUser ? acceptedUser.email : email,
        invited_by: SEED_USERS.superadmin.id,
        token_hash: tokenHashHex,
        expires_in_days: expiresInDays,
        expires_at: new Date(
          state === 'expired' ? now - day : now + expiresInDays * day,
        ).toISOString(),
        last_sent_at: new Date(state === 'expired' ? now - 2 * day : now).toISOString(),
        send_status: state === 'send_failed' ? 'failed' : 'sent',
        send_attempts: 1,
        accepted_at: acceptedUser ? new Date(now).toISOString() : null,
        accepted_user_id: acceptedUser?.id ?? null,
        revoked_at: state === 'revoked' ? new Date(now).toISOString() : null,
        revoked_by: state === 'revoked' ? SEED_USERS.superadmin.id : null,
        access_request_id: accessRequestId ?? null,
      })
      .select('id, email')
      .single(),
    'invitation',
  );
  return { id: row.id, email: row.email, token, acceptedUser };
}

export type AccessRequestState = 'new' | 'invited' | 'discarded';

/** Access request in any state (the privacy acceptance points to the effective privacy document). */
export async function createAccessRequest({
  state = 'new',
  email = uniqueEmail('solicitud'),
  fullName = `Solicitante ${shortId()}`,
}: { state?: AccessRequestState; email?: string; fullName?: string } = {}): Promise<{
  id: string;
  email: string;
  invitation?: CreatedInvitation;
}> {
  const admin = adminClient();
  const privacy = must(
    await admin
      .from('legal_documents')
      .select('id')
      .eq('kind', 'privacy')
      .lte('effective_at', new Date().toISOString())
      .order('effective_at', { ascending: false })
      .limit(1)
      .single(),
    'privacy document',
  );
  const now = new Date().toISOString();
  const request = must(
    await admin
      .from('access_requests')
      .insert({
        full_name: fullName,
        email,
        company_or_role: 'Empresa de prueba',
        privacy_document_id: privacy.id,
        privacy_accepted_at: now,
        status: 'new',
      })
      .select('id')
      .single(),
    'access request',
  );
  if (state === 'new') return { id: request.id, email };

  if (state === 'discarded') {
    must(
      await admin
        .from('access_requests')
        .update({
          status: 'discarded',
          discarded_at: now,
          reviewed_at: now,
          reviewed_by: SEED_USERS.superadmin.id,
        })
        .eq('id', request.id)
        .select('id')
        .single(),
      'discard request',
    );
    return { id: request.id, email };
  }

  const invitation = await createInvitation({ email, accessRequestId: request.id });
  must(
    await admin
      .from('access_requests')
      .update({
        status: 'invited',
        invitation_id: invitation.id,
        reviewed_at: now,
        reviewed_by: SEED_USERS.superadmin.id,
      })
      .eq('id', request.id)
      .select('id')
      .single(),
    'invite request',
  );
  return { id: request.id, email, invitation };
}

/** Reads one row back for assertions (service role, bypasses RLS). */
export async function auditEventsFor(objectId: string) {
  return must(
    await adminClient()
      .from('audit_logs')
      .select('*')
      .eq('object_id', objectId)
      .order('occurred_at'),
    'audit events',
  );
}
