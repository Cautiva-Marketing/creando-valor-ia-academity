-- Migration: products, immutable product versions and objections (T010) — data-model.md →
-- "Productos y objeciones". Writes only through security definer functions (T044, T059).
--
-- Rollback:
--   drop table if exists public.objections, public.product_versions, public.products;
--   drop function if exists private.valid_text_array(text[], int, int, int),
--     private.reject_immutable_change(), private.match_product_organization();

-- Shared helpers --------------------------------------------------------------------------------------
-- Text arrays: min..max elements, each 1..maxlen characters and not only spaces.
create or replace function private.valid_text_array(p_arr text[], p_min int, p_max int, p_maxlen int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_arr is not null
     and coalesce(array_ndims(p_arr), 1) = 1
     and cardinality(p_arr) between p_min and p_max
     and not exists (
       select 1 from unnest(p_arr) as e
        where e is null or char_length(e) > p_maxlen or btrim(e) = ''
     );
$$;

-- Immutable rows (FR-002, FR-022, FR-044): UPDATE and DELETE always fail, also for service_role.
create or replace function private.reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '42501';
end;
$$;

-- Child rows inherit the organization of their product.
create or replace function private.match_product_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select p.organization_id into v_org from public.products p where p.id = new.product_id;
  if v_org is null or v_org <> new.organization_id then
    raise exception 'organization_id must match the product organization' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.valid_text_array(text[], int, int, int) from public;
revoke all on function private.reject_immutable_change() from public;
revoke all on function private.match_product_organization() from public;
-- CHECK constraints run with the privileges of the writing role.
grant execute on function private.valid_text_array(text[], int, int, int) to authenticated, service_role;

-- products --------------------------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  status public.product_status not null default 'active',
  current_version integer not null default 1
    constraint products_current_version_positive check (current_version >= 1),
  current_name text not null
    constraint products_current_name_length
    check (char_length(current_name) between 2 and 120 and char_length(btrim(current_name)) >= 2),
  archived_at timestamptz,
  create_idempotency_key uuid constraint products_create_idempotency_key_key unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_archived_at_consistent check ((status = 'archived') = (archived_at is not null))
);
create index products_org_status_updated_idx on public.products (organization_id, status, updated_at desc);
create index products_org_name_idx on public.products (organization_id, lower(current_name));

create trigger products_set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
-- No physical deletion of products (FR-003).
create trigger products_no_delete before delete on public.products
  for each row execute function private.reject_immutable_change();

-- product_versions (immutable) ------------------------------------------------------------------------
create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  version integer not null constraint product_versions_version_positive check (version >= 1),
  sector public.product_sector not null,
  name text not null
    constraint product_versions_name_length
    check (char_length(name) between 2 and 120 and char_length(btrim(name)) >= 2),
  description text not null default ''
    constraint product_versions_description_length check (char_length(description) <= 1000),
  price_kind public.price_kind not null,
  price_min numeric(12, 2) not null constraint product_versions_price_min_non_negative check (price_min >= 0),
  price_max numeric(12, 2) not null,
  benefits text[] not null
    constraint product_versions_benefits_valid check (private.valid_text_array(benefits, 1, 10, 200)),
  differentiators text[] not null default '{}'
    constraint product_versions_differentiators_valid
    check (private.valid_text_array(differentiators, 0, 10, 200)),
  verifiable_facts text[] not null default '{}'
    constraint product_versions_verifiable_facts_valid
    check (private.valid_text_array(verifiable_facts, 0, 10, 200)),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint product_versions_product_version_key unique (product_id, version),
  constraint product_versions_price_range check (price_max >= price_min),
  constraint product_versions_fixed_price check (price_kind <> 'fixed' or price_max = price_min)
);
create index product_versions_org_product_idx on public.product_versions (organization_id, product_id);

create trigger product_versions_match_org before insert on public.product_versions
  for each row execute function private.match_product_organization();
create trigger product_versions_immutable before update or delete on public.product_versions
  for each row execute function private.reject_immutable_change();

-- objections --------------------------------------------------------------------------------------------
create table public.objections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  text text not null
    constraint objections_text_length
    check (char_length(text) between 5 and 300 and char_length(btrim(text)) >= 5),
  category public.objection_category,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index objections_org_product_created_idx on public.objections (organization_id, product_id, created_at);

create trigger objections_match_org before insert or update on public.objections
  for each row execute function private.match_product_organization();
create trigger objections_set_updated_at before update on public.objections
  for each row execute function private.set_updated_at();
