-- Migration: product functions (T044) — contracts/database-rpc.md → "Productos y objeciones",
-- data-model.md → products / product_versions. The payload is validated here with the same rules as
-- productSchema (src/features/products/schemas.ts); invalid fields raise 23514 with DETAIL = field.
--
-- Rollback:
--   drop function if exists public.set_product_status(uuid, public.product_status),
--     public.update_product(uuid, integer, jsonb), public.create_product(uuid, jsonb, uuid),
--     private.product_payload(jsonb), private.payload_text_array(jsonb, text, int, int, int),
--     private.assert_seller_org(uuid);
--   and restore private.audit_allowed_keys from 20261123000700_core_functions.sql.

-- Authorization shared by every seller function (contracts/database-rpc.md, header):
--   no user / invalid session → 42501; member of p_org but organization or membership suspended →
--   42501; otherwise not an active `vendedor` of p_org → P0002 (does not reveal existence).
create or replace function private.assert_seller_org(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_org is not null and private.has_org_role(p_org, 'vendedor') then
    return;
  end if;
  if exists (
    select 1
      from public.memberships m
      join public.organizations o on o.id = m.organization_id
     where m.organization_id = p_org
       and m.user_id = auth.uid()
       and (m.status = 'suspended' or o.status = 'suspended')
  ) then
    raise exception 'organization suspended' using errcode = '42501';
  end if;
  raise exception 'not found' using errcode = 'P0002';
end;
$$;

-- jsonb array of strings → trimmed text[] with min..max elements of 1..maxlen characters.
-- Absent or null → empty array (then the min check applies).
create or replace function private.payload_text_array(
  p_payload jsonb,
  p_key text,
  p_min int,
  p_max int,
  p_maxlen int
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value jsonb := p_payload -> p_key;
  v_out text[];
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    v_out := '{}';
  elsif jsonb_typeof(v_value) <> 'array'
     or exists (select 1 from jsonb_array_elements(v_value) e where jsonb_typeof(e) <> 'string') then
    raise exception 'invalid %', p_key using errcode = '23514', detail = p_key;
  else
    select coalesce(array_agg(btrim(e) order by ord), '{}')
      into v_out
      from jsonb_array_elements_text(v_value) with ordinality as x(e, ord);
  end if;
  if not private.valid_text_array(v_out, p_min, p_max, p_maxlen) then
    raise exception 'invalid %', p_key using errcode = '23514', detail = p_key;
  end if;
  return v_out;
end;
$$;

-- Validated, normalized product content as a product_versions row (only content columns are set).
-- Rules: data-model.md → product_versions; prices with at most 2 decimals; fixed → max = min.
create or replace function private.product_payload(p_payload jsonb)
returns public.product_versions
language plpgsql
immutable
set search_path = ''
as $$
declare
  v public.product_versions;
  v_text text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid payload' using errcode = '23514', detail = 'payload';
  end if;

  v_text := case when jsonb_typeof(p_payload -> 'sector') = 'string' then p_payload ->> 'sector' end;
  if v_text is null or not (v_text = any (enum_range(null::public.product_sector)::text[])) then
    raise exception 'invalid sector' using errcode = '23514', detail = 'sector';
  end if;
  v.sector := v_text::public.product_sector;

  v_text := case when jsonb_typeof(p_payload -> 'name') = 'string' then btrim(p_payload ->> 'name') end;
  if v_text is null or char_length(v_text) not between 2 and 120 then
    raise exception 'invalid name' using errcode = '23514', detail = 'name';
  end if;
  v.name := v_text;

  if p_payload -> 'description' is null or jsonb_typeof(p_payload -> 'description') = 'null' then
    v.description := '';
  elsif jsonb_typeof(p_payload -> 'description') <> 'string'
     or char_length(btrim(p_payload ->> 'description')) > 1000 then
    raise exception 'invalid description' using errcode = '23514', detail = 'description';
  else
    v.description := btrim(p_payload ->> 'description');
  end if;

  v_text := case when jsonb_typeof(p_payload -> 'price_kind') = 'string' then p_payload ->> 'price_kind' end;
  if v_text is null or v_text not in ('fixed', 'range') then
    raise exception 'invalid price_kind' using errcode = '23514', detail = 'price_kind';
  end if;
  v.price_kind := v_text::public.price_kind;

  if jsonb_typeof(p_payload -> 'price_min') is distinct from 'number'
     or (p_payload ->> 'price_min')::numeric < 0
     or (p_payload ->> 'price_min')::numeric > 9999999999.99
     or (p_payload ->> 'price_min')::numeric <> round((p_payload ->> 'price_min')::numeric, 2) then
    raise exception 'invalid price_min' using errcode = '23514', detail = 'price_min';
  end if;
  v.price_min := (p_payload ->> 'price_min')::numeric;

  if v.price_kind = 'fixed' then
    v.price_max := v.price_min;
  elsif jsonb_typeof(p_payload -> 'price_max') is distinct from 'number'
     or (p_payload ->> 'price_max')::numeric < v.price_min
     or (p_payload ->> 'price_max')::numeric > 9999999999.99
     or (p_payload ->> 'price_max')::numeric <> round((p_payload ->> 'price_max')::numeric, 2) then
    raise exception 'invalid price_max' using errcode = '23514', detail = 'price_max';
  else
    v.price_max := (p_payload ->> 'price_max')::numeric;
  end if;

  v.benefits := private.payload_text_array(p_payload, 'benefits', 1, 10, 200);
  v.differentiators := private.payload_text_array(p_payload, 'differentiators', 0, 10, 200);
  v.verifiable_facts := private.payload_text_array(p_payload, 'verifiable_facts', 0, 10, 200);
  return v;
end;
$$;

-- create_product -------------------------------------------------------------------------------------
create or replace function public.create_product(p_org uuid, p_payload jsonb, p_idempotency_key uuid)
returns table (product_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v public.product_versions;
begin
  perform private.assert_seller_org(p_org);
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;

  -- Same key → the product created by the first request (idempotent retry).
  select p.id into v_id
    from public.products p
   where p.create_idempotency_key = p_idempotency_key and p.organization_id = p_org;
  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  v := private.product_payload(p_payload);

  insert into public.products (organization_id, created_by, current_name, create_idempotency_key)
  values (p_org, v_uid, v.name, p_idempotency_key)
  on conflict (create_idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Concurrent request with the same key won the insert.
    select p.id into v_id
      from public.products p
     where p.create_idempotency_key = p_idempotency_key and p.organization_id = p_org;
    if v_id is null then
      raise exception 'not found' using errcode = 'P0002';
    end if;
    return query select v_id, true;
    return;
  end if;

  insert into public.product_versions (
    organization_id, product_id, version, sector, name, description, price_kind, price_min, price_max,
    benefits, differentiators, verifiable_facts, created_by
  ) values (
    p_org, v_id, 1, v.sector, v.name, v.description, v.price_kind, v.price_min, v.price_max,
    v.benefits, v.differentiators, v.verifiable_facts, v_uid
  );

  return query select v_id, false;
end;
$$;

-- update_product -------------------------------------------------------------------------------------
create or replace function public.update_product(p_product uuid, p_expected_version integer, p_payload jsonb)
returns table (version integer, unchanged boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_product public.products;
  v_current public.product_versions;
  v public.product_versions;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select p.organization_id into v_org from public.products p where p.id = p_product;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_org);

  select * into v_product from public.products p where p.id = p_product for update;
  if v_product.current_version is distinct from p_expected_version then
    raise exception 'version_mismatch' using errcode = 'P0010', detail = 'version_mismatch';
  end if;

  v := private.product_payload(p_payload);
  select * into v_current
    from public.product_versions pv
   where pv.product_id = p_product and pv.version = v_product.current_version;

  if (v.sector, v.name, v.description, v.price_kind, v.price_min, v.price_max, v.benefits,
      v.differentiators, v.verifiable_facts)
     is not distinct from
     (v_current.sector, v_current.name, v_current.description, v_current.price_kind,
      v_current.price_min, v_current.price_max, v_current.benefits, v_current.differentiators,
      v_current.verifiable_facts) then
    return query select v_product.current_version, true;
    return;
  end if;

  insert into public.product_versions (
    organization_id, product_id, version, sector, name, description, price_kind, price_min, price_max,
    benefits, differentiators, verifiable_facts, created_by
  ) values (
    v_org, p_product, v_product.current_version + 1, v.sector, v.name, v.description, v.price_kind,
    v.price_min, v.price_max, v.benefits, v.differentiators, v.verifiable_facts, v_uid
  );
  update public.products p
     set current_version = v_product.current_version + 1, current_name = v.name
   where p.id = p_product;

  return query select v_product.current_version + 1, false;
end;
$$;

-- set_product_status ---------------------------------------------------------------------------------
create or replace function public.set_product_status(p_product uuid, p_status public.product_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_status public.product_status;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'status required' using errcode = '22023';
  end if;
  select p.organization_id into v_org from public.products p where p.id = p_product;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_org);

  select p.status into v_status from public.products p where p.id = p_product for update;
  if v_status = p_status then
    return; -- idempotent: no change, no audit
  end if;

  update public.products p
     set status = p_status,
         archived_at = case when p_status = 'archived' then now() end
   where p.id = p_product;

  perform private.write_audit(
    'user', v_uid, null, v_org,
    case when p_status = 'archived' then 'product.archived' else 'product.reactivated' end,
    'product', p_product::text, '{}'::jsonb, 'success'
  );
end;
$$;

-- Audit catalog: + product.archived / product.reactivated (data: {}) --------------------------------------
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
    else null
  end;
$$;

-- Grants ---------------------------------------------------------------------------------------------
revoke all on function private.assert_seller_org(uuid) from public;
revoke all on function private.payload_text_array(jsonb, text, int, int, int) from public;
revoke all on function private.product_payload(jsonb) from public;
revoke all on function private.audit_allowed_keys(text) from public;
grant execute on function private.assert_seller_org(uuid) to service_role;

revoke all on function public.create_product(uuid, jsonb, uuid) from public, anon;
revoke all on function public.update_product(uuid, integer, jsonb) from public, anon;
revoke all on function public.set_product_status(uuid, public.product_status) from public, anon;
grant execute on function public.create_product(uuid, jsonb, uuid) to authenticated;
grant execute on function public.update_product(uuid, integer, jsonb) to authenticated;
grant execute on function public.set_product_status(uuid, public.product_status) to authenticated;
