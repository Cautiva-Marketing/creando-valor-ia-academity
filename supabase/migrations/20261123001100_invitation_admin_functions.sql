-- Migration: invitation administration (T092) — contracts/database-rpc.md, data-model.md.
-- Every function checks private.is_superadmin() (aal2), validates, mutates and audits in the same
-- transaction.
-- Rollback:
--   drop function if exists public.admin_list_invitations(text, text, int, int);
--   drop function if exists public.admin_create_invitation(text, int, bytea, uuid, uuid);
--   drop function if exists public.admin_resend_invitation(uuid, bytea, uuid);
--   drop function if exists public.admin_mark_invitation_sent(uuid, boolean);
--   drop function if exists public.admin_revoke_invitation(uuid);
--   drop function if exists private.require_superadmin();

create or replace function private.require_superadmin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_superadmin() then
    raise exception 'superadmin with aal2 required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function private.require_superadmin() from public;

-- List ------------------------------------------------------------------------------------------------
create or replace function public.admin_list_invitations(
  p_status text default null,
  p_q text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  email text,
  status text,
  expires_at timestamptz,
  last_sent_at timestamptz,
  send_status public.email_send_status,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform private.require_superadmin();
  if p_status is not null and p_status not in ('pending', 'accepted', 'expired', 'revoked') then
    raise exception 'invalid status filter' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid pagination' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select i.id, i.email,
           public.invitation_status(i.accepted_at, i.revoked_at, i.expires_at) as status,
           i.expires_at, i.last_sent_at, i.send_status, i.created_at
      from public.invitations i
     where (v_q is null
            or i.email like '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select f.id, f.email, f.status, f.expires_at, f.last_sent_at, f.send_status, f.created_at,
         count(*) over () as total_count
    from filtered f
   where p_status is null or f.status = p_status
   order by f.created_at desc, f.id
   limit p_limit offset p_offset;
end;
$$;

-- Create (idempotent by p_idempotency_key) -------------------------------------------------------------
create or replace function public.admin_create_invitation(
  p_email text,
  p_days int,
  p_token_hash bytea,
  p_access_request_id uuid,
  p_idempotency_key uuid
)
returns table (invitation_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_superadmin();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_open uuid;
  v_request public.access_requests%rowtype;
  v_data jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 30 then
    raise exception 'invalid expiry days' using errcode = '22023';
  end if;

  -- Serializes concurrent submissions for the same email (double click → same row, never 23505).
  perform pg_advisory_xact_lock(hashtextextended('invitation:' || v_email, 0));

  select i.id into v_id from public.invitations i where i.idempotency_key = p_idempotency_key;
  if found then
    return query select v_id, true;
    return;
  end if;

  -- FR-010: an account with a membership or superadmin role blocks; orphan accounts do not.
  if exists (
    select 1
      from auth.users u
     where lower(u.email) = v_email
       and (exists (select 1 from public.memberships m where m.user_id = u.id)
            or exists (select 1 from public.platform_admins pa where pa.user_id = u.id))
  ) then
    raise exception 'account exists' using errcode = 'P0012', detail = 'account_exists';
  end if;

  -- Pending or expired (not accepted, not revoked) invitation for the same email.
  select i.id into v_open
    from public.invitations i
   where i.email = v_email and i.accepted_at is null and i.revoked_at is null
   limit 1;
  if found then
    raise exception 'open invitation' using errcode = 'P0012', detail = 'open_invitation:' || v_open;
  end if;

  if p_access_request_id is not null then
    select * into v_request from public.access_requests r where r.id = p_access_request_id for update;
    if not found then
      raise exception 'access request not found' using errcode = 'P0002';
    end if;
    if v_request.status <> 'new' or v_request.anonymized_at is not null then
      raise exception 'access request not convertible' using errcode = 'P0010';
    end if;
  end if;

  insert into public.invitations (
    email, invited_by, token_hash, expires_in_days, expires_at, send_status, send_attempts,
    access_request_id, idempotency_key
  ) values (
    v_email, v_uid, p_token_hash, p_days, now() + make_interval(days => p_days), 'pending', 0,
    p_access_request_id, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select i.id into v_id from public.invitations i where i.idempotency_key = p_idempotency_key;
    return query select v_id, true;
    return;
  end if;

  v_data := jsonb_build_object('email_domain', split_part(v_email, '@', 2), 'expires_in_days', p_days);
  if p_access_request_id is not null then
    v_data := v_data || jsonb_build_object('access_request_id', p_access_request_id);
  end if;
  perform private.write_audit(
    'user', v_uid, null, null, 'invitation.created', 'invitation', v_id::text, v_data, 'success'
  );

  if p_access_request_id is not null then
    update public.access_requests
       set status = 'invited', invitation_id = v_id, reviewed_by = v_uid, reviewed_at = now()
     where id = p_access_request_id;
    perform private.write_audit(
      'user', v_uid, null, null, 'access_request.converted', 'access_request', p_access_request_id::text,
      jsonb_build_object('invitation_id', v_id), 'success'
    );
  end if;

  return query select v_id, false;
end;
$$;

-- Resend (idempotent by p_idempotency_key) -------------------------------------------------------------
create or replace function public.admin_resend_invitation(
  p_invitation_id uuid,
  p_token_hash bytea,
  p_idempotency_key uuid
)
returns table (invitation_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_superadmin();
  v_inv public.invitations%rowtype;
  v_status text;
  v_new_expiry timestamptz;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  select * into v_inv from public.invitations i where i.id = p_invitation_id for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.resend_idempotency_key is not distinct from p_idempotency_key then
    return query select v_inv.id, true;
    return;
  end if;
  v_status := public.invitation_status(v_inv.accepted_at, v_inv.revoked_at, v_inv.expires_at);
  if v_status not in ('pending', 'expired') then
    raise exception 'invitation cannot be resent' using errcode = 'P0010', detail = v_status;
  end if;

  v_new_expiry := now() + make_interval(days => v_inv.expires_in_days);
  update public.invitations
     set token_hash = p_token_hash,
         expires_at = v_new_expiry,
         resend_idempotency_key = p_idempotency_key,
         send_status = 'pending'
   where id = v_inv.id;

  perform private.write_audit(
    'user', v_uid, null, null, 'invitation.resent', 'invitation', v_inv.id::text,
    jsonb_build_object('previous_expires_at', v_inv.expires_at, 'expires_at', v_new_expiry), 'success'
  );
  return query select v_inv.id, false;
end;
$$;

-- Send result (no audit) -------------------------------------------------------------------------------
create or replace function public.admin_mark_invitation_sent(p_id uuid, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_superadmin();
  update public.invitations
     set send_status = case when p_ok then 'sent'::public.email_send_status else 'failed'::public.email_send_status end,
         send_attempts = send_attempts + 1,
         last_sent_at = case when p_ok then now() else last_sent_at end
   where id = p_id;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Revoke (idempotent by state) -------------------------------------------------------------------------
create or replace function public.admin_revoke_invitation(p_id uuid)
returns table (invitation_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_superadmin();
  v_inv public.invitations%rowtype;
  v_status text;
begin
  select * into v_inv from public.invitations i where i.id = p_id for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  v_status := public.invitation_status(v_inv.accepted_at, v_inv.revoked_at, v_inv.expires_at);
  if v_status = 'revoked' then
    return query select v_inv.id, true;
    return;
  end if;
  if v_status = 'accepted' then
    raise exception 'accepted invitation cannot be revoked' using errcode = 'P0010', detail = 'accepted';
  end if;

  update public.invitations set revoked_at = now(), revoked_by = v_uid where id = v_inv.id;
  perform private.write_audit(
    'user', v_uid, null, null, 'invitation.revoked', 'invitation', v_inv.id::text,
    jsonb_build_object('previous_status', v_status), 'success'
  );
  return query select v_inv.id, false;
end;
$$;

-- Grants -------------------------------------------------------------------------------------------------
revoke all on function public.admin_list_invitations(text, text, int, int) from public, anon;
revoke all on function public.admin_create_invitation(text, int, bytea, uuid, uuid) from public, anon;
revoke all on function public.admin_resend_invitation(uuid, bytea, uuid) from public, anon;
revoke all on function public.admin_mark_invitation_sent(uuid, boolean) from public, anon;
revoke all on function public.admin_revoke_invitation(uuid) from public, anon;
grant execute on function public.admin_list_invitations(text, text, int, int) to authenticated;
grant execute on function public.admin_create_invitation(text, int, bytea, uuid, uuid) to authenticated;
grant execute on function public.admin_resend_invitation(uuid, bytea, uuid) to authenticated;
grant execute on function public.admin_mark_invitation_sent(uuid, boolean) to authenticated;
grant execute on function public.admin_revoke_invitation(uuid) to authenticated;
