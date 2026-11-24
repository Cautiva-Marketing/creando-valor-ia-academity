-- Migration: triggers (T015) — contracts/database-rpc.md → Triggers
--
-- Rollback:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop trigger if exists on_auth_user_email_updated on auth.users;
--   drop trigger ... (each trigger below) and
--   drop function if exists private.set_updated_at(), private.handle_new_user(),
--     private.handle_user_email_change(), private.prevent_audit_mutation(),
--     private.protect_effective_legal_document(), private.validate_personal_membership(),
--     private.protect_profile_full_name(), private.touch_onboarding_updated_at();

-- updated_at ---------------------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();
create trigger teams_set_updated_at before update on public.teams
  for each row execute function private.set_updated_at();
create trigger quotas_set_updated_at before update on public.quotas
  for each row execute function private.set_updated_at();
create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function private.set_updated_at();
create trigger access_requests_set_updated_at before update on public.access_requests
  for each row execute function private.set_updated_at();

-- auth.users → profiles ------------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, coalesce(lower(btrim(new.email)), ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = coalesce(lower(btrim(new.email)), '')
     where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- audit_logs is append-only (also for service_role) ------------------------------------------------
create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_mutation();

-- legal_documents are immutable once effective -------------------------------------------------------
create or replace function private.protect_effective_legal_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.effective_at <= now() then
    raise exception 'legal document already effective' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger legal_documents_immutable before update or delete on public.legal_documents
  for each row execute function private.protect_effective_legal_document();

-- personal organizations: roles {vendedor} and at most one membership (FR-002) ----------------------
create or replace function private.validate_personal_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.organization_type;
begin
  select o.type into v_type from public.organizations o where o.id = new.organization_id;
  if v_type = 'personal' then
    if new.roles <> array['vendedor']::public.org_role[] then
      raise exception 'personal organizations only allow the vendedor role'
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.memberships m
       where m.organization_id = new.organization_id and m.id <> new.id
    ) then
      raise exception 'personal organizations allow a single membership' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_validate_personal before insert or update on public.memberships
  for each row execute function private.validate_personal_membership();

-- profiles.full_name never goes back to NULL ----------------------------------------------------------
create or replace function private.protect_profile_full_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.full_name is not null and new.full_name is null then
    raise exception 'full_name cannot be cleared' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_full_name before update on public.profiles
  for each row execute function private.protect_profile_full_name();

-- profiles.onboarding_updated_at ---------------------------------------------------------------------
create or replace function private.touch_onboarding_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.onboarding_status is distinct from old.onboarding_status
     or new.onboarding_step is distinct from old.onboarding_step then
    new.onboarding_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_touch_onboarding before update of onboarding_status, onboarding_step
  on public.profiles
  for each row execute function private.touch_onboarding_updated_at();

-- Trigger functions run with the privileges of the writing role (except the security definer ones).
revoke all on function private.set_updated_at() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_user_email_change() from public;
revoke all on function private.prevent_audit_mutation() from public;
revoke all on function private.protect_effective_legal_document() from public;
revoke all on function private.validate_personal_membership() from public;
revoke all on function private.protect_profile_full_name() from public;
revoke all on function private.touch_onboarding_updated_at() from public;
