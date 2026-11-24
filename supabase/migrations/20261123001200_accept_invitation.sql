-- Migration: atomic invitation acceptance (T103) — data-model.md "Operaciones atómicas clave",
-- contracts/database-rpc.md. Only service_role may execute accept_invitation.
-- Rollback:
--   drop function if exists public.accept_invitation(bytea, uuid, text, uuid, uuid);
--   drop function if exists private.slugify(text);

-- Slug base: unaccent, lowercase, non-alphanumerics → '-', base ≤ 55, fallback 'org'.
create or replace function private.slugify(p_value text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
begin
  v := lower(extensions.unaccent(coalesce(p_value, '')));
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := btrim(v, '-');
  v := btrim(left(v, 55), '-');
  return case when v = '' then 'org' else v end;
end;
$$;

revoke all on function private.slugify(text) from public;

create or replace function public.accept_invitation(
  p_token_hash bytea,
  p_user_id uuid,
  p_full_name text,
  p_terms_doc uuid,
  p_ai_notice_doc uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_user_email text;
  v_base text;
  v_slug text;
  v_org uuid;
  v_membership uuid;
  v_attempt int := 0;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid full name' using errcode = '22023';
  end if;

  select * into v_inv from public.invitations i where i.token_hash = p_token_hash for update;
  if not found then
    raise exception 'invitation not usable' using errcode = 'P0011', detail = 'invalid';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation not usable' using errcode = 'P0011', detail = 'used';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation not usable' using errcode = 'P0011', detail = 'revoked';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation not usable' using errcode = 'P0011', detail = 'expired';
  end if;
  if v_inv.target_organization_id is not null and not exists (
    select 1 from public.organizations o where o.id = v_inv.target_organization_id and o.status = 'active'
  ) then
    raise exception 'invitation not usable' using errcode = 'P0011', detail = 'organization_suspended';
  end if;

  -- The user must have the invitation's email and be an orphan account.
  select lower(u.email) into v_user_email from auth.users u where u.id = p_user_id;
  if v_user_email is distinct from v_inv.email
     or exists (select 1 from public.memberships m where m.user_id = p_user_id)
     or exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id) then
    raise exception 'invitation not usable' using errcode = 'P0011', detail = 'invalid';
  end if;

  -- The documents the person saw must be the current ones of their kind (FR-015).
  if p_terms_doc is distinct from (
       select d.id from public.legal_documents d
        where d.kind = 'terms' and d.effective_at <= now()
        order by d.effective_at desc limit 1)
     or p_ai_notice_doc is distinct from (
       select d.id from public.legal_documents d
        where d.kind = 'ai_notice' and d.effective_at <= now()
        order by d.effective_at desc limit 1) then
    raise exception 'legal documents outdated' using errcode = 'P0011', detail = 'legal_outdated';
  end if;

  update public.profiles set full_name = v_name where user_id = p_user_id;

  -- Unique slug: base, then base-xxxx on collision.
  v_base := private.slugify(v_name);
  v_slug := v_base;
  loop
    begin
      insert into public.organizations (type, name, slug, timezone, status)
      values ('personal', v_name, v_slug, 'America/Lima', 'active')
      returning id into v_org;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 20 then
        raise;
      end if;
      v_slug := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    end;
  end loop;

  insert into public.memberships (organization_id, user_id, roles, status, invited_at, joined_at)
  values (v_org, p_user_id, array['vendedor']::public.org_role[], 'active', v_inv.created_at, now())
  returning id into v_membership;

  insert into public.quotas (organization_id, daily_limit, monthly_limit) values (v_org, 10, 100);

  insert into public.legal_acceptances (user_id, document_id)
  values (p_user_id, p_terms_doc), (p_user_id, p_ai_notice_doc)
  on conflict (user_id, document_id) do nothing;

  update public.invitations
     set accepted_at = now(), accepted_user_id = p_user_id
   where id = v_inv.id;

  if v_inv.access_request_id is not null then
    update public.access_requests
       set status = 'invited', invitation_id = v_inv.id
     where id = v_inv.access_request_id and status <> 'invited';
  end if;

  perform private.write_audit(
    'user', p_user_id, null, v_org, 'invitation.accepted', 'invitation', v_inv.id::text,
    jsonb_build_object('organization_id', v_org, 'user_id', p_user_id), 'success'
  );

  return jsonb_build_object('organization_id', v_org, 'membership_id', v_membership);
end;
$$;

revoke all on function public.accept_invitation(bytea, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation(bytea, uuid, text, uuid, uuid) to service_role;
