-- Migration: core multi-tenant tables (T013) — data-model.md → Entidades
--
-- Rollback:
--   drop table if exists public.ai_usage, public.quotas, public.teams, public.memberships,
--     public.platform_admins, public.profiles, public.organizations;
--   drop function if exists private.is_valid_timezone(text), private.org_roles_unique(public.org_role[]);

-- Validation helpers used by CHECK constraints -----------------------------------------------------
create or replace function private.is_valid_timezone(p_tz text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_tz is not null
     and exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_tz);
$$;

create or replace function private.org_roles_unique(p_roles public.org_role[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select count(*) = count(distinct r) from unnest(p_roles) as r;
$$;

-- CHECK constraints run with the privileges of the writing role.
revoke all on function private.is_valid_timezone(text) from public;
revoke all on function private.org_roles_unique(public.org_role[]) from public;
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;
grant execute on function private.org_roles_unique(public.org_role[]) to authenticated, service_role;

-- organizations (tenant root) --------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  type public.organization_type not null,
  name text not null
    constraint organizations_name_length check (char_length(name) between 1 and 120 and btrim(name) <> ''),
  slug text not null
    constraint organizations_slug_key unique
    constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  sector text,
  timezone text not null default 'America/Lima'
    constraint organizations_timezone_valid check (private.is_valid_timezone(timezone)),
  status public.organization_status not null default 'active',
  suspended_reason text
    constraint organizations_suspended_reason_length check (char_length(suspended_reason) <= 500),
  suspended_at timestamptz,
  suspended_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_suspended_reason_required
    check (status <> 'suspended' or btrim(coalesce(suspended_reason, '')) <> '')
);
create index organizations_status_idx on public.organizations (status);
create index organizations_created_at_idx on public.organizations (created_at);

-- profiles (1:1 auth.users) ----------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null
    constraint profiles_email_normalized check (email = lower(btrim(email))),
  full_name text
    constraint profiles_full_name_valid
    check (full_name is null or (char_length(full_name) between 1 and 80 and btrim(full_name) <> '')),
  timezone text not null default 'America/Lima'
    constraint profiles_timezone_valid check (private.is_valid_timezone(timezone)),
  onboarding_status public.onboarding_status not null default 'pending',
  onboarding_step smallint not null default 1
    constraint profiles_onboarding_step_range check (onboarding_step between 1 and 3),
  onboarding_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);

-- platform_admins (superadmin is a platform role, not an org_role) --------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by_label text not null
    constraint platform_admins_label_length check (char_length(btrim(created_by_label)) between 1 and 120)
);

-- memberships ------------------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  roles public.org_role[] not null
    constraint memberships_roles_valid check (cardinality(roles) > 0 and private.org_roles_unique(roles)),
  status public.membership_status not null default 'active',
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_org_user_key unique (organization_id, user_id),
  constraint memberships_joined_when_active check (status <> 'active' or joined_at is not null)
);
create index memberships_organization_id_idx on public.memberships (organization_id);
create index memberships_user_id_idx on public.memberships (user_id);

-- teams (no UI in this stage) --------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null
    constraint teams_name_length check (char_length(name) between 1 and 80 and btrim(name) <> ''),
  manager_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_org_name_key unique (organization_id, name)
);
create index teams_organization_id_idx on public.teams (organization_id);

-- quotas (1:1 organization) ----------------------------------------------------------------------
create table public.quotas (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  daily_limit integer not null default 10
    constraint quotas_daily_limit_non_negative check (daily_limit >= 0),
  monthly_limit integer not null default 100
    constraint quotas_monthly_limit_non_negative check (monthly_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint quotas_daily_le_monthly check (daily_limit <= monthly_limit)
);

-- ai_usage (no message content, ever) ------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  task public.ai_task not null,
  model text not null
    constraint ai_usage_model_length check (char_length(model) between 1 and 100),
  simulation_id uuid,
  input_tokens integer not null constraint ai_usage_input_tokens_non_negative check (input_tokens >= 0),
  output_tokens integer not null constraint ai_usage_output_tokens_non_negative check (output_tokens >= 0),
  latency_ms integer not null constraint ai_usage_latency_non_negative check (latency_ms >= 0),
  estimated_cost_usd numeric(12, 6) not null
    constraint ai_usage_cost_non_negative check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);
create index ai_usage_organization_created_idx on public.ai_usage (organization_id, created_at);
