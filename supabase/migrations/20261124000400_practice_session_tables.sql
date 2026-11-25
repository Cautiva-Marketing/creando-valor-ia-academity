-- Migration: practice sessions, public buyer profile, hidden secrets, reveals and immutable messages
-- (T012) — data-model.md → "Sesiones de práctica". Writes only through functions (T074, T101).
--
-- Rollback:
--   drop table if exists public.practice_messages, public.practice_session_reveals,
--     public.practice_session_secrets, public.practice_buyer_profiles, public.practice_sessions;
--   drop function if exists private.match_session_owner();

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  product_version_id uuid not null references public.product_versions (id) on delete restrict,
  product_version integer not null constraint practice_sessions_product_version_positive check (product_version >= 1),
  status public.practice_status not null default 'configured',
  difficulty smallint not null constraint practice_sessions_difficulty_range check (difficulty between 1 and 5),
  hints_enabled boolean not null default true,
  focus_stage public.cautiva_stage,
  selected_objection_ids uuid[] not null
    constraint practice_sessions_selected_objections_count
    check (coalesce(array_ndims(selected_objection_ids), 1) = 1 and cardinality(selected_objection_ids) between 1 and 3),
  visible_objection text not null
    constraint practice_sessions_visible_objection_length
    check (char_length(visible_objection) between 5 and 300 and char_length(btrim(visible_objection)) >= 5),
  visible_objection_category public.objection_category,
  interest smallint not null constraint practice_sessions_interest_range check (interest between 0 and 100),
  last_interest_delta smallint not null default 0
    constraint practice_sessions_last_delta_range check (last_interest_delta between -15 and 15),
  seller_message_count smallint not null default 0
    constraint practice_sessions_seller_count_range check (seller_message_count between 0 and 20),
  last_seq integer not null default 0 constraint practice_sessions_last_seq_non_negative check (last_seq >= 0),
  hints_used smallint not null default 0 constraint practice_sessions_hints_used_non_negative check (hints_used >= 0),
  last_hint_at_seller_count smallint,
  end_reason public.practice_end_reason,
  setup_idempotency_key uuid not null constraint practice_sessions_setup_idempotency_key_key unique,
  configured_at timestamptz not null default now(),
  configured_expires_at timestamptz not null,
  started_at timestamptz,
  deadline_at timestamptz,
  provider_wait_ms integer not null default 0
    constraint practice_sessions_provider_wait_non_negative check (provider_wait_ms >= 0),
  ended_at timestamptz,
  discarded_at timestamptz,
  turn_lock_seq integer,
  turn_lock_expires_at timestamptz,
  evaluation_status public.evaluation_status,
  evaluation_phase public.evaluation_phase,
  evaluation_due_at timestamptz,
  evaluation_auto_attempts smallint not null default 0
    constraint practice_sessions_auto_attempts_range check (evaluation_auto_attempts between 0 and 3),
  evaluation_manual_retries smallint not null default 0
    constraint practice_sessions_manual_retries_range check (evaluation_manual_retries between 0 and 3),
  evaluation_failure_code text
    constraint practice_sessions_failure_code_valid
    check (evaluation_failure_code is null or evaluation_failure_code in ('invalid_output', 'provider_error', 'timeout')),
  buyer_setup_prompt_version text not null
    constraint practice_sessions_setup_prompt_version_length check (char_length(buyer_setup_prompt_version) between 1 and 60),
  buyer_prompt_version text not null
    constraint practice_sessions_buyer_prompt_version_length check (char_length(buyer_prompt_version) between 1 and 60),
  buyer_setup_model text not null
    constraint practice_sessions_setup_model_length check (char_length(buyer_setup_model) between 1 and 100),
  buyer_model text not null
    constraint practice_sessions_buyer_model_length check (char_length(buyer_model) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- State coherence (data-model.md → CHECKs de coherencia).
  constraint practice_sessions_evaluation_status_only_finalized
    check ((evaluation_status is not null) = (status = 'finalized')),
  constraint practice_sessions_end_reason_when_ended
    check ((end_reason is not null) = (status in ('finalized', 'evaluated'))),
  constraint practice_sessions_ended_at_when_ended
    check ((ended_at is not null) = (status in ('finalized', 'evaluated'))),
  constraint practice_sessions_started_when_started
    check ((started_at is not null) = (status in ('active', 'finalized', 'evaluated'))),
  constraint practice_sessions_deadline_when_started check ((deadline_at is not null) = (started_at is not null)),
  constraint practice_sessions_discarded_at_when_discarded
    check ((discarded_at is not null) = (status = 'discarded')),
  constraint practice_sessions_turn_lock_pair check ((turn_lock_seq is null) = (turn_lock_expires_at is null)),
  constraint practice_sessions_turn_lock_only_active check (turn_lock_seq is null or status = 'active'),
  constraint practice_sessions_phase_only_in_progress
    check (evaluation_phase is null or evaluation_status = 'in_progress'),
  constraint practice_sessions_due_when_running
    check (evaluation_status not in ('pending', 'in_progress') or evaluation_due_at is not null),
  constraint practice_sessions_expires_after_configured check (configured_expires_at > configured_at)
);
-- At most one active and one configured session per user, even from two devices (FR-015).
create unique index practice_sessions_one_active_per_user on public.practice_sessions (user_id) where status = 'active';
create unique index practice_sessions_one_configured_per_user on public.practice_sessions (user_id) where status = 'configured';
create index practice_sessions_history_idx on public.practice_sessions (organization_id, user_id, started_at desc)
  where started_at is not null;
create index practice_sessions_deadline_idx on public.practice_sessions (status, deadline_at) where status = 'active';
create index practice_sessions_configured_expiry_idx on public.practice_sessions (status, configured_expires_at)
  where status = 'configured';
create index practice_sessions_evaluation_idx on public.practice_sessions (evaluation_status, evaluation_due_at)
  where evaluation_status in ('pending', 'in_progress');
create index practice_sessions_product_idx on public.practice_sessions (product_id);

create trigger practice_sessions_set_updated_at before update on public.practice_sessions
  for each row execute function private.set_updated_at();

-- Children copy organization_id and user_id from their session (cheap owner-only RLS, FR-054).
create or replace function private.match_session_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  select s.organization_id, s.user_id into v_org, v_user
    from public.practice_sessions s where s.id = new.session_id;
  if v_org is null or v_org <> new.organization_id or v_user <> new.user_id then
    raise exception 'organization_id/user_id must match the session' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.match_session_owner() from public;

-- practice_buyer_profiles (public persona) -------------------------------------------------------------
create table public.practice_buyer_profiles (
  session_id uuid primary key references public.practice_sessions (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  name text not null constraint practice_buyer_profiles_name_length check (char_length(name) between 2 and 60 and char_length(btrim(name)) >= 2),
  age smallint not null constraint practice_buyer_profiles_age_range check (age between 18 and 80),
  occupation text not null constraint practice_buyer_profiles_occupation_length check (char_length(occupation) between 2 and 80 and char_length(btrim(occupation)) >= 2),
  intro text not null constraint practice_buyer_profiles_intro_length check (char_length(intro) between 20 and 280),
  goal text not null constraint practice_buyer_profiles_goal_length check (char_length(goal) between 10 and 160),
  revealable_labels public.revealable_key[] not null
    constraint practice_buyer_profiles_labels_valid check (cardinality(revealable_labels) between 1 and 3)
);
create index practice_buyer_profiles_org_idx on public.practice_buyer_profiles (organization_id, session_id);
create trigger practice_buyer_profiles_match_owner before insert or update on public.practice_buyer_profiles
  for each row execute function private.match_session_owner();

-- practice_session_secrets (hidden until the session ends, research.md §R10) -----------------------------
create table public.practice_session_secrets (
  session_id uuid primary key references public.practice_sessions (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  motivation text not null constraint practice_session_secrets_motivation_length check (char_length(motivation) between 10 and 300),
  personality text not null constraint practice_session_secrets_personality_length check (char_length(personality) between 10 and 300),
  revealables jsonb not null
    constraint practice_session_secrets_revealables_shape
    check (jsonb_typeof(revealables) = 'array' and jsonb_array_length(revealables) between 1 and 3),
  hidden_objections jsonb not null
    constraint practice_session_secrets_hidden_shape
    check (jsonb_typeof(hidden_objections) = 'array' and jsonb_array_length(hidden_objections) between 1 and 2),
  opening_message text not null
    constraint practice_session_secrets_opening_length check (char_length(opening_message) between 1 and 600 and btrim(opening_message) <> '')
);
create index practice_session_secrets_org_idx on public.practice_session_secrets (organization_id, session_id);
create trigger practice_session_secrets_match_owner before insert or update on public.practice_session_secrets
  for each row execute function private.match_session_owner();

-- practice_session_reveals (what the seller discovered) --------------------------------------------------
create table public.practice_session_reveals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  session_id uuid not null references public.practice_sessions (id) on delete restrict,
  kind text not null constraint practice_session_reveals_kind_valid check (kind in ('revealable', 'hidden_objection')),
  item_key text not null
    constraint practice_session_reveals_item_key_valid check (
      (kind = 'revealable' and item_key in ('budget', 'timeline', 'decision_maker'))
      or (kind = 'hidden_objection' and item_key in ('h1', 'h2'))
    ),
  value text not null constraint practice_session_reveals_value_length check (char_length(value) between 1 and 300),
  message_seq integer not null constraint practice_session_reveals_seq_positive check (message_seq >= 1),
  revealed_at timestamptz not null default now(),
  constraint practice_session_reveals_once unique (session_id, kind, item_key)
);
create index practice_session_reveals_org_session_idx on public.practice_session_reveals (organization_id, session_id);
create trigger practice_session_reveals_match_owner before insert on public.practice_session_reveals
  for each row execute function private.match_session_owner();
create trigger practice_session_reveals_immutable before update or delete on public.practice_session_reveals
  for each row execute function private.reject_immutable_change();

-- practice_messages (immutable, FR-022) --------------------------------------------------------------------
create table public.practice_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  session_id uuid not null references public.practice_sessions (id) on delete restrict,
  seq integer not null constraint practice_messages_seq_positive check (seq >= 1),
  author public.message_author not null,
  content text not null,
  client_message_id uuid,
  reply_to_seq integer,
  interest_before smallint,
  interest_after smallint,
  interest_delta smallint,
  revealed_keys text[] not null default '{}',
  hidden_objection_raised text
    constraint practice_messages_hidden_raised_valid check (hidden_objection_raised is null or hidden_objection_raised in ('h1', 'h2')),
  seller_abusive boolean,
  ends_session boolean not null default false,
  meta_status public.turn_meta_status,
  created_at timestamptz not null default now(),
  constraint practice_messages_session_seq_key unique (session_id, seq),
  constraint practice_messages_session_client_id_key unique (session_id, client_message_id),
  constraint practice_messages_first_is_buyer check (seq <> 1 or author = 'buyer'),
  constraint practice_messages_content_length check (
    (author = 'seller' and char_length(content) between 1 and 1000 and btrim(content) <> '')
    or (author = 'buyer' and char_length(content) between 1 and 700 and btrim(content) <> '')
  ),
  constraint practice_messages_client_id_for_seller check ((author = 'seller') = (client_message_id is not null)),
  constraint practice_messages_buyer_metadata check (
    (author = 'seller'
      and interest_before is null and interest_after is null and interest_delta is null
      and seller_abusive is null and meta_status is null and reply_to_seq is null
      and hidden_objection_raised is null and cardinality(revealed_keys) = 0)
    or (author = 'buyer'
      and interest_after between 0 and 100
      and (interest_before is null or interest_before between 0 and 100)
      and (interest_delta is null or interest_delta between -15 and 15)
      and meta_status is not null)
  ),
  constraint practice_messages_revealed_keys_valid
    check (revealed_keys <@ array['budget', 'timeline', 'decision_maker']::text[])
);
create index practice_messages_org_session_seq_idx on public.practice_messages (organization_id, session_id, seq);
create trigger practice_messages_match_owner before insert on public.practice_messages
  for each row execute function private.match_session_owner();
create trigger practice_messages_immutable before update or delete on public.practice_messages
  for each row execute function private.reject_immutable_change();
