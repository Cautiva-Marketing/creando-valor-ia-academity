-- Migration: platform tables (T014) — legal documents, invitations, access requests, audit,
-- private rate limiting. data-model.md → Entidades.
--
-- Rollback:
--   alter table public.invitations drop constraint if exists invitations_access_request_id_fkey;
--   alter table public.access_requests drop constraint if exists access_requests_invitation_id_fkey;
--   drop table if exists private.rate_limit_events, public.audit_logs, public.access_requests,
--     public.invitations, public.legal_acceptances, public.legal_documents;

-- legal_documents --------------------------------------------------------------------------------
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  kind public.legal_document_kind not null,
  version text not null
    constraint legal_documents_version_length check (char_length(version) between 1 and 40),
  effective_at timestamptz not null,
  is_draft boolean not null,
  content_path text not null
    constraint legal_documents_content_path_format check (content_path ~ '^content/legal/[a-z0-9._-]+\.md$'),
  created_at timestamptz not null default now(),
  constraint legal_documents_kind_version_key unique (kind, version)
);
create index legal_documents_kind_effective_idx on public.legal_documents (kind, effective_at desc);

-- legal_acceptances ------------------------------------------------------------------------------
create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.legal_documents (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  constraint legal_acceptances_user_document_key unique (user_id, document_id)
);
create index legal_acceptances_document_idx on public.legal_acceptances (document_id);

-- invitations ------------------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null
    constraint invitations_email_normalized check (email = lower(btrim(email)))
    constraint invitations_email_format
      check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  target_organization_id uuid references public.organizations (id) on delete restrict,
  roles public.org_role[] not null default '{vendedor}'
    constraint invitations_roles_valid check (cardinality(roles) > 0 and private.org_roles_unique(roles)),
  invited_by uuid not null references auth.users (id) on delete restrict,
  token_hash bytea not null
    constraint invitations_token_hash_key unique
    constraint invitations_token_hash_length check (octet_length(token_hash) = 32),
  expires_in_days smallint not null default 7
    constraint invitations_expires_in_days_range check (expires_in_days between 1 and 30),
  expires_at timestamptz not null,
  last_sent_at timestamptz,
  send_status public.email_send_status not null default 'pending',
  send_attempts smallint not null default 0
    constraint invitations_send_attempts_non_negative check (send_attempts >= 0),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  access_request_id uuid constraint invitations_access_request_id_key unique,
  idempotency_key uuid constraint invitations_idempotency_key_key unique,
  resend_idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_not_accepted_and_revoked check (accepted_at is null or revoked_at is null),
  constraint invitations_accepted_user_required check (accepted_at is null or accepted_user_id is not null)
);
-- One open (not accepted, not revoked) invitation per normalized email (FR-010).
create unique index invitations_open_email_key on public.invitations (email)
  where accepted_at is null and revoked_at is null;
create index invitations_created_at_idx on public.invitations (created_at);
create index invitations_expires_at_idx on public.invitations (expires_at);

-- access_requests --------------------------------------------------------------------------------
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text
    constraint access_requests_full_name_valid
    check (full_name is null or (char_length(full_name) between 1 and 80 and btrim(full_name) <> '')),
  email text
    constraint access_requests_email_normalized check (email is null or email = lower(btrim(email)))
    constraint access_requests_email_format
      check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  company_or_role text
    constraint access_requests_company_length check (company_or_role is null or char_length(company_or_role) <= 120),
  message text
    constraint access_requests_message_length check (message is null or char_length(message) <= 500),
  privacy_document_id uuid not null references public.legal_documents (id) on delete restrict,
  privacy_accepted_at timestamptz not null,
  status public.access_request_status not null default 'new',
  invitation_id uuid,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  discarded_at timestamptz,
  discarded_by_system boolean not null default false,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_anonymized_no_pii check (
    anonymized_at is null
    or (full_name is null and email is null and company_or_role is null and message is null)
  ),
  constraint access_requests_pii_until_anonymized check (
    anonymized_at is not null or (full_name is not null and email is not null)
  ),
  constraint access_requests_invited_has_invitation check (status <> 'invited' or invitation_id is not null),
  constraint access_requests_discarded_has_date check (status <> 'discarded' or discarded_at is not null)
);
create unique index access_requests_new_email_key on public.access_requests (email)
  where status = 'new' and anonymized_at is null;
create index access_requests_status_created_idx on public.access_requests (status, created_at);
create index access_requests_discarded_pending_anon_idx on public.access_requests (discarded_at)
  where status = 'discarded' and anonymized_at is null;

-- Circular FK invitations ↔ access_requests --------------------------------------------------------
alter table public.invitations
  add constraint invitations_access_request_id_fkey
  foreign key (access_request_id) references public.access_requests (id) on delete set null;
alter table public.access_requests
  add constraint access_requests_invitation_id_fkey
  foreign key (invitation_id) references public.invitations (id) on delete restrict;
create index access_requests_invitation_idx on public.access_requests (invitation_id);

-- audit_logs (append-only; organization_id nullable: platform events, see plan Complexity Tracking)
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type public.audit_actor_type not null,
  actor_user_id uuid,
  actor_label text
    constraint audit_logs_actor_label_length check (actor_label is null or char_length(actor_label) <= 120),
  organization_id uuid references public.organizations (id) on delete restrict,
  action text not null,
  object_type text not null,
  object_id text,
  data jsonb not null default '{}'::jsonb
    constraint audit_logs_data_object check (jsonb_typeof(data) = 'object'),
  result public.audit_result not null default 'success'
);
create index audit_logs_organization_occurred_idx on public.audit_logs (organization_id, occurred_at);
create index audit_logs_action_occurred_idx on public.audit_logs (action, occurred_at);
create index audit_logs_actor_occurred_idx on public.audit_logs (actor_user_id, occurred_at);

-- private.rate_limit_events (keys are HMAC-SHA256 with a server pepper: no PII) ---------------------
create table private.rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null
    constraint rate_limit_events_scope_valid check (scope in (
      'login_account', 'login_ip', 'mfa_verify', 'recovery_email', 'activation_ip',
      'access_request_ip', 'webhook_id', 'user_mutation'
    )),
  key_hash bytea not null,
  occurred_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on private.rate_limit_events (scope, key_hash, occurred_at desc);
create index rate_limit_events_occurred_idx on private.rate_limit_events (occurred_at);
