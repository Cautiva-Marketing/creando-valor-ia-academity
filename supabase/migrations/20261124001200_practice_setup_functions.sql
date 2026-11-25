-- Migration: practice setup and start (T074) — contracts/database-rpc.md → "Práctica" and
-- "Solo service_role"; data-model.md → practice_sessions, practice_buyer_profiles,
-- practice_session_secrets, simulation_consumptions, practice_setup_attempts. FR-009–FR-019.
--
-- Rollback:
--   drop function if exists public.start_practice_session(uuid),
--     public.record_practice_setup_failure(uuid, text), public.create_configured_practice(uuid, jsonb),
--     public.check_practice_setup(uuid, uuid[]), public.practice_quota_status(),
--     private.practice_setup_counts(uuid, uuid), private.raise_if_quota_exhausted(uuid),
--     private.practice_org_for(uuid), private.utc_iso(timestamptz), private.setup_text(jsonb, text, int, int);

-- ISO 8601 UTC for DETAIL payloads parsed by src/lib/action-result.ts.
create or replace function private.utc_iso(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

-- Personal organization of a seller (products and practices live there). No membership → P0002;
-- membership or organization suspended → 42501 (contracts/database-rpc.md, header).
create or replace function private.practice_org_for(p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_membership public.membership_status;
  v_org_status public.organization_status;
begin
  select m.organization_id, m.status, o.status
    into v_org, v_membership, v_org_status
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = p_user
     and o.type = 'personal'
     and 'vendedor' = any (m.roles)
     and m.status <> 'invited'
   order by m.created_at
   limit 1;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_membership <> 'active' or v_org_status <> 'active' then
    raise exception 'organization suspended' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- P0020 with DETAIL `daily:<iso>` | `monthly:<iso>` | `disabled` when the quota is exhausted.
create or replace function private.raise_if_quota_exhausted(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text;
  v_renews timestamptz;
begin
  select q.exhausted_scope, q.renews_at into v_scope, v_renews from private.practice_quota_status(p_org) q;
  if v_scope = 'disabled' then
    raise exception 'quota exhausted' using errcode = 'P0020', detail = 'disabled';
  elsif v_scope is not null then
    raise exception 'quota exhausted' using errcode = 'P0020', detail = v_scope || ':' || private.utc_iso(v_renews);
  end if;
end;
$$;

-- Setup attempts of the user today (organization time zone) and when configuring opens again (FR-016).
create or replace function private.practice_setup_counts(p_org uuid, p_user uuid)
returns table (success_today int, failure_today int, retry_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_local timestamp;
  v_day_start timestamptz;
begin
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  v_local := now() at time zone v_tz;
  v_day_start := date_trunc('day', v_local) at time zone v_tz;
  select count(*) filter (where a.outcome = 'success')::int, count(*) filter (where a.outcome = 'failure')::int
    into success_today, failure_today
    from public.practice_setup_attempts a
   where a.organization_id = p_org and a.user_id = p_user and a.created_at >= v_day_start;
  retry_at := case
    when success_today >= 30 or failure_today >= 30
      then (date_trunc('day', v_local) + interval '1 day') at time zone v_tz
  end;
  return next;
end;
$$;

-- Trimmed text of a jsonb key with length bounds, or 23514 (DETAIL = key).
create or replace function private.setup_text(p_obj jsonb, p_key text, p_min int, p_max int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_obj is null or jsonb_typeof(p_obj -> p_key) is distinct from 'string' then
    raise exception 'invalid %', p_key using errcode = '23514', detail = p_key;
  end if;
  v_text := btrim(p_obj ->> p_key);
  if char_length(v_text) not between p_min and p_max then
    raise exception 'invalid %', p_key using errcode = '23514', detail = p_key;
  end if;
  return v_text;
end;
$$;

-- practice_quota_status() ----------------------------------------------------------------------------
create or replace function public.practice_quota_status()
returns table (
  daily_used int,
  daily_limit int,
  monthly_used int,
  monthly_limit int,
  remaining_today int,
  remaining_month int,
  exhausted_scope text,
  renews_at timestamptz,
  setup_success_today int,
  setup_failure_today int,
  setup_retry_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_org := private.practice_org_for(auth.uid());
  return query
    select q.daily_used, q.daily_limit, q.monthly_used, q.monthly_limit, q.remaining_today,
           q.remaining_month, q.exhausted_scope, q.renews_at, c.success_today, c.failure_today, c.retry_at
      from private.practice_quota_status(v_org) q
     cross join private.practice_setup_counts(v_org, auth.uid()) c;
end;
$$;

-- check_practice_setup -------------------------------------------------------------------------------
-- No side effects. Order (contracts): active session → P0022; quota → P0020; setup caps → P0021;
-- active product of the organization → P0002 / P0010 product_archived; 1–3 objections of it → P0002.
create or replace function public.check_practice_setup(p_product uuid, p_objection_ids uuid[])
returns table (product_version_id uuid, sector public.product_sector, objections jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_active uuid;
  v_counts record;
  v_product public.products;
  v_version public.product_versions;
  v_objections jsonb;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_org := private.practice_org_for(v_uid);

  select s.id into v_active from public.practice_sessions s where s.user_id = v_uid and s.status = 'active';
  if v_active is not null then
    raise exception 'active session' using errcode = 'P0022', detail = v_active::text;
  end if;

  perform private.raise_if_quota_exhausted(v_org);

  select * into v_counts from private.practice_setup_counts(v_org, v_uid);
  if v_counts.success_today >= 30 then
    raise exception 'setup limit' using errcode = 'P0021', detail = 'success:' || private.utc_iso(v_counts.retry_at);
  elsif v_counts.failure_today >= 30 then
    raise exception 'setup limit' using errcode = 'P0021', detail = 'failure:' || private.utc_iso(v_counts.retry_at);
  end if;

  select * into v_product from public.products p where p.id = p_product and p.organization_id = v_org;
  if v_product.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_product.status = 'archived' then
    raise exception 'product_archived' using errcode = 'P0010', detail = 'product_archived';
  end if;

  if p_objection_ids is null
     or coalesce(array_ndims(p_objection_ids), 1) <> 1
     or cardinality(p_objection_ids) not between 1 and 3
     or (select count(distinct x) from unnest(p_objection_ids) x) <> cardinality(p_objection_ids)
     or (select count(*) from public.objections o where o.id = any (p_objection_ids) and o.product_id = p_product)
        <> cardinality(p_objection_ids) then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select * into v_version
    from public.product_versions pv
   where pv.product_id = p_product and pv.version = v_product.current_version;

  select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text, 'category', o.category) order by x.ord)
    into v_objections
    from unnest(p_objection_ids) with ordinality as x(id, ord)
    join public.objections o on o.id = x.id;

  return query select v_version.id, v_version.sector, v_objections;
end;
$$;

-- create_configured_practice (service_role) -----------------------------------------------------------
-- Payload (built by configurePractice from check_practice_setup + validated AI output):
-- { setup_idempotency_key, product_id, product_version_id, objection_ids[1..3], visible_objection_id,
--   generated_hidden_objection: {text, category?} | null, difficulty, hints_enabled, focus_stage | null,
--   buyer: {name, age, occupation, intro, goal, motivation, personality},
--   revealables: {budget: {amount_min, amount_max, display}, timeline: {display}, decision_maker: {display}},
--   opening_message, buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model }
-- Objection texts are copied here from `objections` (FR-008), never taken from the payload.
create or replace function public.create_configured_practice(p_user uuid, p_payload jsonb)
returns table (session_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_key uuid;
  v_existing uuid;
  v_active uuid;
  v_product public.products;
  v_version public.product_versions;
  v_ids uuid[];
  v_visible_id uuid;
  v_visible public.objections;
  v_hidden jsonb := '[]'::jsonb;
  v_generated jsonb;
  v_difficulty int;
  v_focus text;
  v_buyer jsonb;
  v_rev jsonb;
  v_budget_min numeric;
  v_budget_max numeric;
  v_session uuid;
  v_n int := 0;
  v_row record;
begin
  if p_user is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('practice_setup:' || p_user::text, 0));
  v_org := private.practice_org_for(p_user);

  begin
    v_key := (p_payload ->> 'setup_idempotency_key')::uuid;
  exception when others then
    raise exception 'invalid setup_idempotency_key' using errcode = '22023';
  end;
  if v_key is null then
    raise exception 'invalid setup_idempotency_key' using errcode = '22023';
  end if;

  select s.id into v_existing from public.practice_sessions s
   where s.setup_idempotency_key = v_key and s.user_id = p_user;
  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  select s.id into v_active from public.practice_sessions s where s.user_id = p_user and s.status = 'active';
  if v_active is not null then
    raise exception 'active session' using errcode = 'P0022', detail = v_active::text;
  end if;

  -- Product, current version and objections of the organization.
  select * into v_product from public.products p
   where p.id = (p_payload ->> 'product_id')::uuid and p.organization_id = v_org;
  if v_product.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_product.status = 'archived' then
    raise exception 'product_archived' using errcode = 'P0010', detail = 'product_archived';
  end if;
  select * into v_version from public.product_versions pv
   where pv.id = (p_payload ->> 'product_version_id')::uuid and pv.product_id = v_product.id;
  if v_version.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_payload -> 'objection_ids') is distinct from 'array' then
    raise exception 'invalid objection_ids' using errcode = '23514', detail = 'objection_ids';
  end if;
  select array_agg(x::uuid order by ord) into v_ids
    from jsonb_array_elements_text(p_payload -> 'objection_ids') with ordinality as t(x, ord);
  if v_ids is null or cardinality(v_ids) not between 1 and 3
     or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'invalid objection_ids' using errcode = '23514', detail = 'objection_ids';
  end if;
  if (select count(*) from public.objections o where o.id = any (v_ids) and o.product_id = v_product.id)
     <> cardinality(v_ids) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  v_visible_id := (p_payload ->> 'visible_objection_id')::uuid;
  if v_visible_id is null or not (v_visible_id = any (v_ids)) then
    raise exception 'invalid visible_objection_id' using errcode = '23514', detail = 'visible_objection_id';
  end if;
  select * into v_visible from public.objections o where o.id = v_visible_id;

  -- Hidden objections: the other chosen ones (h1, h2) or one generated when only one was chosen.
  v_generated := p_payload -> 'generated_hidden_objection';
  if cardinality(v_ids) = 1 then
    if v_generated is null or jsonb_typeof(v_generated) <> 'object' then
      raise exception 'generated hidden objection required' using errcode = '23514', detail = 'generated_hidden_objection';
    end if;
    if v_generated ? 'category' and jsonb_typeof(v_generated -> 'category') = 'string'
       and not ((v_generated ->> 'category') = any (enum_range(null::public.objection_category)::text[])) then
      raise exception 'invalid category' using errcode = '23514', detail = 'generated_hidden_objection';
    end if;
    v_hidden := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', 'h1',
      'text', private.setup_text(v_generated, 'text', 5, 300),
      'category', case when jsonb_typeof(v_generated -> 'category') = 'string' then v_generated ->> 'category' end,
      'source', 'generated'
    )));
  else
    if v_generated is not null and jsonb_typeof(v_generated) <> 'null' then
      raise exception 'unexpected generated hidden objection' using errcode = '23514', detail = 'generated_hidden_objection';
    end if;
    for v_row in
      select o.text, o.category
        from unnest(v_ids) with ordinality as x(id, ord)
        join public.objections o on o.id = x.id
       where x.id <> v_visible_id
       order by x.ord
    loop
      v_n := v_n + 1;
      v_hidden := v_hidden || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'h' || v_n, 'text', v_row.text, 'category', v_row.category, 'source', 'seller'
      )));
    end loop;
  end if;

  -- Scenario options.
  if jsonb_typeof(p_payload -> 'difficulty') is distinct from 'number' then
    raise exception 'invalid difficulty' using errcode = '23514', detail = 'difficulty';
  end if;
  v_difficulty := (p_payload ->> 'difficulty')::numeric;
  if v_difficulty not between 1 and 5 or (p_payload ->> 'difficulty')::numeric <> v_difficulty then
    raise exception 'invalid difficulty' using errcode = '23514', detail = 'difficulty';
  end if;
  if jsonb_typeof(p_payload -> 'hints_enabled') is distinct from 'boolean' then
    raise exception 'invalid hints_enabled' using errcode = '23514', detail = 'hints_enabled';
  end if;
  v_focus := case when jsonb_typeof(p_payload -> 'focus_stage') = 'string' then p_payload ->> 'focus_stage' end;
  if v_focus is not null and not (v_focus = any (enum_range(null::public.cautiva_stage)::text[])) then
    raise exception 'invalid focus_stage' using errcode = '23514', detail = 'focus_stage';
  end if;

  -- Buyer persona (FR-012): lengths here, budget vs. price of the version (70 %–130 %).
  v_buyer := p_payload -> 'buyer';
  v_rev := p_payload -> 'revealables';
  if jsonb_typeof(v_buyer) is distinct from 'object' or jsonb_typeof(v_rev) is distinct from 'object'
     or jsonb_typeof(v_buyer -> 'age') is distinct from 'number'
     or (v_buyer ->> 'age')::numeric not between 18 and 80
     or (v_buyer ->> 'age')::numeric <> round((v_buyer ->> 'age')::numeric) then
    raise exception 'invalid buyer' using errcode = '23514', detail = 'buyer';
  end if;
  if jsonb_typeof(v_rev #> '{budget,amount_min}') is distinct from 'number'
     or jsonb_typeof(v_rev #> '{budget,amount_max}') is distinct from 'number' then
    raise exception 'invalid budget' using errcode = '23514', detail = 'budget';
  end if;
  v_budget_min := (v_rev #>> '{budget,amount_min}')::numeric;
  v_budget_max := (v_rev #>> '{budget,amount_max}')::numeric;
  if v_budget_min < 0 or v_budget_max < v_budget_min
     or v_budget_min < 0.7 * v_version.price_min
     or v_budget_max > 1.3 * v_version.price_max then
    raise exception 'budget out of range' using errcode = '23514', detail = 'budget';
  end if;

  -- Only one configured session per user: the previous one is discarded (FR-015).
  update public.practice_sessions s
     set status = 'discarded', discarded_at = now()
   where s.user_id = p_user and s.status = 'configured';

  insert into public.practice_sessions (
    organization_id, user_id, product_id, product_version_id, product_version, status, difficulty,
    hints_enabled, focus_stage, selected_objection_ids, visible_objection, visible_objection_category,
    interest, setup_idempotency_key, configured_at, configured_expires_at, buyer_setup_prompt_version,
    buyer_prompt_version, buyer_setup_model, buyer_model
  ) values (
    v_org, p_user, v_product.id, v_version.id, v_version.version, 'configured', v_difficulty,
    (p_payload ->> 'hints_enabled')::boolean, v_focus::public.cautiva_stage, v_ids, v_visible.text,
    v_visible.category, private.initial_interest(v_difficulty), v_key, now(), now() + interval '24 hours',
    private.setup_text(p_payload, 'buyer_setup_prompt_version', 1, 60),
    private.setup_text(p_payload, 'buyer_prompt_version', 1, 60),
    private.setup_text(p_payload, 'buyer_setup_model', 1, 100),
    private.setup_text(p_payload, 'buyer_model', 1, 100)
  )
  returning id into v_session;

  insert into public.practice_buyer_profiles (
    session_id, organization_id, user_id, name, age, occupation, intro, goal, revealable_labels
  ) values (
    v_session, v_org, p_user,
    private.setup_text(v_buyer, 'name', 2, 60),
    (v_buyer ->> 'age')::smallint,
    private.setup_text(v_buyer, 'occupation', 2, 80),
    private.setup_text(v_buyer, 'intro', 20, 280),
    private.setup_text(v_buyer, 'goal', 10, 160),
    array['budget', 'timeline', 'decision_maker']::public.revealable_key[]
  );

  insert into public.practice_session_secrets (
    session_id, organization_id, user_id, motivation, personality, revealables, hidden_objections,
    opening_message
  ) values (
    v_session, v_org, p_user,
    private.setup_text(v_buyer, 'motivation', 10, 300),
    private.setup_text(v_buyer, 'personality', 10, 300),
    jsonb_build_array(
      jsonb_build_object('key', 'budget', 'value', private.setup_text(v_rev -> 'budget', 'display', 1, 160),
                         'budget_min', v_budget_min, 'budget_max', v_budget_max),
      jsonb_build_object('key', 'timeline', 'value', private.setup_text(v_rev -> 'timeline', 'display', 1, 160)),
      jsonb_build_object('key', 'decision_maker', 'value', private.setup_text(v_rev -> 'decision_maker', 'display', 1, 160))
    ),
    v_hidden,
    private.setup_text(p_payload, 'opening_message', 1, 600)
  );

  insert into public.practice_setup_attempts (organization_id, user_id, outcome)
  values (v_org, p_user, 'success');

  return query select v_session, false;
end;
$$;

-- record_practice_setup_failure (service_role) --------------------------------------------------------
create or replace function public.record_practice_setup_failure(p_user uuid, p_failure_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if p_failure_code is null or p_failure_code not in ('provider_unavailable', 'invalid_persona') then
    raise exception 'invalid failure code' using errcode = '22023';
  end if;
  v_org := private.practice_org_for(p_user);
  insert into public.practice_setup_attempts (organization_id, user_id, outcome, failure_code)
  values (v_org, p_user, 'failure', p_failure_code);
end;
$$;

-- start_practice_session -----------------------------------------------------------------------------
-- Consumes one simulation atomically with the quota check (FR-018): the quotas row of the organization
-- is locked, so two concurrent starts cannot exceed the limit.
create or replace function public.start_practice_session(p_session uuid)
returns table (session_id uuid, already_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session public.practice_sessions;
  v_active uuid;
  v_opening text;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_session from public.practice_sessions s where s.id = p_session and s.user_id = v_uid for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_session.organization_id);

  if v_session.status = 'active' then
    return query select v_session.id, true;
    return;
  end if;
  if v_session.status <> 'configured' then
    raise exception 'not_configured' using errcode = 'P0010', detail = 'not_configured';
  end if;
  if v_session.configured_expires_at <= now() then
    raise exception 'expired' using errcode = 'P0010', detail = 'expired';
  end if;

  select s.id into v_active from public.practice_sessions s where s.user_id = v_uid and s.status = 'active';
  if v_active is not null then
    raise exception 'active session' using errcode = 'P0022', detail = v_active::text;
  end if;

  perform 1 from public.quotas q where q.organization_id = v_session.organization_id for update;
  perform private.raise_if_quota_exhausted(v_session.organization_id);

  select sec.opening_message into v_opening
    from public.practice_session_secrets sec where sec.session_id = v_session.id;

  begin
    update public.practice_sessions s
       set status = 'active',
           started_at = now(),
           deadline_at = now() + interval '20 minutes',
           interest = private.initial_interest(v_session.difficulty),
           last_seq = 1
     where s.id = v_session.id;
  exception when unique_violation then
    select s.id into v_active from public.practice_sessions s where s.user_id = v_uid and s.status = 'active';
    raise exception 'active session' using errcode = 'P0022', detail = coalesce(v_active::text, '');
  end;

  insert into public.simulation_consumptions (session_id, organization_id, user_id)
  values (v_session.id, v_session.organization_id, v_uid);

  insert into public.practice_messages (
    organization_id, user_id, session_id, seq, author, content, interest_after, meta_status
  ) values (
    v_session.organization_id, v_uid, v_session.id, 1, 'buyer', v_opening,
    private.initial_interest(v_session.difficulty), 'valid'
  );

  return query select v_session.id, false;
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------
revoke all on function private.utc_iso(timestamptz) from public;
revoke all on function private.practice_org_for(uuid) from public;
revoke all on function private.raise_if_quota_exhausted(uuid) from public;
revoke all on function private.practice_setup_counts(uuid, uuid) from public;
revoke all on function private.setup_text(jsonb, text, int, int) from public;
grant execute on function private.practice_org_for(uuid) to service_role;

revoke all on function public.practice_quota_status() from public, anon;
revoke all on function public.check_practice_setup(uuid, uuid[]) from public, anon;
revoke all on function public.start_practice_session(uuid) from public, anon;
revoke all on function public.create_configured_practice(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_practice_setup_failure(uuid, text) from public, anon, authenticated;
grant execute on function public.practice_quota_status() to authenticated;
grant execute on function public.check_practice_setup(uuid, uuid[]) to authenticated;
grant execute on function public.start_practice_session(uuid) to authenticated;
grant execute on function public.create_configured_practice(uuid, jsonb) to service_role;
grant execute on function public.record_practice_setup_failure(uuid, text) to service_role;
