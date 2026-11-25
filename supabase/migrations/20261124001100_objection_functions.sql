-- Migration: objection functions (T059) — contracts/database-rpc.md → "Productos y objeciones",
-- data-model.md → objections (5–300 characters, optional category, at most 20 per product).
-- Sessions keep a copy of the texts (FR-008), so editing or deleting never touches them.
--
-- Rollback:
--   drop function if exists public.delete_objection(uuid),
--     public.update_objection(uuid, text, public.objection_category),
--     public.create_objection(uuid, text, public.objection_category), private.objection_text(text);
--   and restore private.audit_allowed_keys from 20261124001000_product_functions.sql.

-- Trimmed text of 5..300 characters or 23514 (DETAIL = text).
create or replace function private.objection_text(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if char_length(v_text) not between 5 and 300 then
    raise exception 'invalid objection text' using errcode = '23514', detail = 'text';
  end if;
  return v_text;
end;
$$;

create or replace function public.create_objection(
  p_product uuid,
  p_text text,
  p_category public.objection_category
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_text text;
  v_id uuid;
begin
  if auth.uid() is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select p.organization_id into v_org from public.products p where p.id = p_product;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_org);
  v_text := private.objection_text(p_text);

  -- Serializes concurrent inserts for the same product so the count below is exact.
  perform 1 from public.products p where p.id = p_product for update;
  if (select count(*) from public.objections o where o.product_id = p_product) >= 20 then
    raise exception 'objection_limit' using errcode = 'P0010', detail = 'objection_limit';
  end if;

  insert into public.objections (organization_id, product_id, text, category)
  values (v_org, p_product, v_text, p_category)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_objection(
  p_objection uuid,
  p_text text,
  p_category public.objection_category
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_text text;
begin
  if auth.uid() is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.organization_id into v_org from public.objections o where o.id = p_objection;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_org);
  v_text := private.objection_text(p_text);

  update public.objections o
     set text = v_text, category = p_category
   where o.id = p_objection;
end;
$$;

create or replace function public.delete_objection(p_objection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_product uuid;
begin
  if auth.uid() is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.organization_id, o.product_id into v_org, v_product
    from public.objections o where o.id = p_objection;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_org);

  delete from public.objections o where o.id = p_objection;
  perform private.write_audit(
    'user', auth.uid(), null, v_org, 'objection.deleted', 'objection', p_objection::text,
    jsonb_build_object('product_id', v_product), 'success'
  );
end;
$$;

-- Audit catalog: + objection.deleted (data: { product_id }) -------------------------------------------
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
    when 'product.archived' then array[]::text[]
    when 'product.reactivated' then array[]::text[]
    when 'objection.deleted' then array['product_id']
    else null
  end;
$$;

-- Grants ---------------------------------------------------------------------------------------------
revoke all on function private.objection_text(text) from public;
revoke all on function private.audit_allowed_keys(text) from public;

revoke all on function public.create_objection(uuid, text, public.objection_category) from public, anon;
revoke all on function public.update_objection(uuid, text, public.objection_category) from public, anon;
revoke all on function public.delete_objection(uuid) from public, anon;
grant execute on function public.create_objection(uuid, text, public.objection_category) to authenticated;
grant execute on function public.update_objection(uuid, text, public.objection_category) to authenticated;
grant execute on function public.delete_objection(uuid) to authenticated;
