-- Migration: core functions (T018) — contracts/database-rpc.md
--   public.invitation_status, private/public.write_audit, public.get_request_context
--
-- Rollback:
--   drop function if exists public.get_request_context(), public.write_audit(...),
--     private.write_audit(...), private.audit_allowed_keys(text), public.invitation_status(...);

-- Derived invitation status (identifiers in English; Spanish labels only in the UI) ----------------
create or replace function public.invitation_status(
  p_accepted_at timestamptz,
  p_revoked_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_accepted_at is not null then 'accepted'
    when p_revoked_at is not null then 'revoked'
    when p_expires_at <= now() then 'expired'
    else 'pending'
  end;
$$;

revoke all on function public.invitation_status(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.invitation_status(timestamptz, timestamptz, timestamptz)
  to authenticated, service_role;

-- Audit catalog (data-model.md#audit-actions): action → allowed data keys -----------------------------
create or replace function private.audit_allowed_keys(p_action text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_action
    when 'invitation.created' then array['email_domain', 'expires_in_days', 'access_request_id']
    when 'invitation.resent' then array['previous_expires_at', 'expires_at']
    when 'invitation.revoked' then array['previous_status']
    when 'invitation.accepted' then array['organization_id', 'user_id']
    when 'superadmin.login' then array['step']
    when 'superadmin.mfa_enrolled' then array[]::text[]
    when 'superadmin.mfa_reset' then array['sessions_revoked']
    when 'quota.updated' then array['before', 'after']
    when 'organization.suspended' then array['reason']
    when 'organization.reactivated' then array['previous_reason']
    when 'access_request.converted' then array['invitation_id']
    when 'access_request.discarded' then array['automatic']
    else null
  end;
$$;

create or replace function private.write_audit(
  p_actor_type public.audit_actor_type,
  p_actor_user_id uuid,
  p_actor_label text,
  p_org uuid,
  p_action text,
  p_object_type text,
  p_object_id text,
  p_data jsonb default '{}'::jsonb,
  p_result public.audit_result default 'success'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed text[] := private.audit_allowed_keys(p_action);
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_id bigint;
begin
  if v_allowed is null then
    raise exception 'unknown audit action' using errcode = '22023';
  end if;
  if jsonb_typeof(v_data) <> 'object' then
    raise exception 'audit data must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(v_data) k where not (k = any (v_allowed))) then
    raise exception 'audit data key not allowed for action' using errcode = '22023';
  end if;
  if p_action = 'superadmin.login'
     and coalesce(v_data ->> 'step', '') not in ('mfa_verify', 'mfa_enroll') then
    raise exception 'superadmin.login requires a valid step' using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_type, actor_user_id, actor_label, organization_id, action, object_type, object_id, data, result
  ) values (
    p_actor_type, p_actor_user_id, p_actor_label, p_org, p_action, p_object_type, p_object_id,
    v_data, coalesce(p_result, 'success')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.audit_allowed_keys(text) from public;
revoke all on function private.write_audit(
  public.audit_actor_type, uuid, text, uuid, text, text, text, jsonb, public.audit_result
) from public;

-- Server-side wrapper (secret key only): events that happen before aal2 (TOTP failures) or outside SQL.
create or replace function public.write_audit(
  p_actor_type public.audit_actor_type,
  p_actor_user_id uuid,
  p_actor_label text,
  p_org uuid,
  p_action text,
  p_object_type text,
  p_object_id text,
  p_data jsonb default '{}'::jsonb,
  p_result public.audit_result default 'success'
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select private.write_audit(
    p_actor_type, p_actor_user_id, p_actor_label, p_org, p_action, p_object_type, p_object_id,
    p_data, p_result
  );
$$;

revoke all on function public.write_audit(
  public.audit_actor_type, uuid, text, uuid, text, text, text, jsonb, public.audit_result
) from public, anon, authenticated;
grant execute on function public.write_audit(
  public.audit_actor_type, uuid, text, uuid, text, text, text, jsonb, public.audit_result
) to service_role;

-- Request context: one call per request (research.md §R3) -------------------------------------------
create or replace function public.get_request_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'email', p.email,
    'full_name', p.full_name,
    'timezone', p.timezone,
    'session_ok', private.current_session_ok(),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'is_superadmin_account', exists (
      select 1 from public.platform_admins pa where pa.user_id = p.user_id
    ),
    'has_verified_factor', exists (
      select 1 from auth.mfa_factors f
       where f.user_id = p.user_id and f.status = 'verified' and f.factor_type = 'totp'
    ),
    'onboarding_status', p.onboarding_status,
    'onboarding_step', p.onboarding_step,
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization_id', m.organization_id,
        'type', o.type,
        'status', m.status,
        'roles', to_jsonb(m.roles),
        'org_status', o.status
      ) order by m.created_at)
        from public.memberships m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = p.user_id
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.user_id = auth.uid();
$$;

revoke all on function public.get_request_context() from public, anon;
grant execute on function public.get_request_context() to authenticated, service_role;
