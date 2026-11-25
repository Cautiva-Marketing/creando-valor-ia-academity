-- Migration: practice helpers (T016) — contracts/database-rpc.md → "Privadas", research.md §R7.
--   private.practice_quota_status(org), private.initial_interest(difficulty), private.mood(interest),
--   public.insert_ai_usage(p_row) (service_role only, never content).
--   Rate-limit scopes practice_turn and practice_status (T025, contracts/route-handlers.md).
--
-- Rollback:
--   drop function if exists public.insert_ai_usage(jsonb), private.mood(int),
--     private.initial_interest(int), private.practice_quota_status(uuid);
--   restore rate_limit_events_scope_valid with the eight 001 scopes.

-- Quota usage of an organization in its own time zone, counted on simulation_consumptions ------------
create or replace function private.practice_quota_status(p_org uuid)
returns table (
  daily_used int,
  daily_limit int,
  monthly_used int,
  monthly_limit int,
  remaining_today int,
  remaining_month int,
  exhausted_scope text,
  renews_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_local timestamp;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_daily_limit int;
  v_monthly_limit int;
  v_daily_used int;
  v_monthly_used int;
begin
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  if v_tz is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  select coalesce(q.daily_limit, 0), coalesce(q.monthly_limit, 0)
    into v_daily_limit, v_monthly_limit
    from public.organizations o
    left join public.quotas q on q.organization_id = o.id
   where o.id = p_org;

  v_local := now() at time zone v_tz;
  v_day_start := date_trunc('day', v_local) at time zone v_tz;
  v_month_start := date_trunc('month', v_local) at time zone v_tz;

  select count(*) filter (where c.consumed_at >= v_day_start)::int, count(*)::int
    into v_daily_used, v_monthly_used
    from public.simulation_consumptions c
   where c.organization_id = p_org and c.consumed_at >= v_month_start;

  daily_used := v_daily_used;
  daily_limit := v_daily_limit;
  monthly_used := v_monthly_used;
  monthly_limit := v_monthly_limit;
  remaining_month := greatest(0, v_monthly_limit - v_monthly_used);
  remaining_today := greatest(0, least(v_daily_limit - v_daily_used, remaining_month));

  if v_daily_limit = 0 or v_monthly_limit = 0 then
    exhausted_scope := 'disabled';
    renews_at := null;
  elsif v_monthly_used >= v_monthly_limit then
    -- The monthly limit frees a simulation only at the start of the next local month.
    exhausted_scope := 'monthly';
    renews_at := (date_trunc('month', v_local) + interval '1 month') at time zone v_tz;
  elsif v_daily_used >= v_daily_limit then
    exhausted_scope := 'daily';
    renews_at := (date_trunc('day', v_local) + interval '1 day') at time zone v_tz;
  else
    exhausted_scope := null;
    renews_at := null;
  end if;
  return next;
end;
$$;

-- Initial interest by difficulty (FR-010, FR-027) -------------------------------------------------------
create or replace function private.initial_interest(p_difficulty int)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case p_difficulty when 1 then 55 when 2 then 50 when 3 then 45 when 4 then 35 when 5 then 25 end)::smallint;
$$;

-- Mood bands (FR-026); mirrored in src/features/practice/domain/mood.ts --------------------------------
create or replace function private.mood(p_interest int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_interest is null then null
    when p_interest < 30 then 'distrustful'
    when p_interest < 55 then 'doubtful'
    when p_interest < 80 then 'interested'
    else 'ready'
  end;
$$;

-- ai_usage writer: one row per AI call attempt, never content (FR-019) ----------------------------------
create or replace function public.insert_ai_usage(p_row jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.ai_task;
  v_org uuid;
  v_user uuid;
  v_sim uuid;
  v_allowed constant text[] := array[
    'organization_id', 'user_id', 'task', 'model', 'simulation_id', 'input_tokens', 'output_tokens',
    'latency_ms', 'first_chunk_ms', 'estimated_cost_usd', 'outcome', 'attempt'
  ];
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'row must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_row) k where not (k = any (v_allowed))) then
    raise exception 'unknown ai_usage key' using errcode = '22023';
  end if;
  v_task := (p_row ->> 'task')::public.ai_task;
  v_org := (p_row ->> 'organization_id')::uuid;
  v_user := nullif(p_row ->> 'user_id', '')::uuid;
  v_sim := nullif(p_row ->> 'simulation_id', '')::uuid;

  -- The persona is generated before the session exists (FR-019); turns and evaluation always
  -- reference their session, which must belong to the same organization.
  if v_task::text = 'buyer_setup' and v_sim is not null then
    raise exception 'buyer_setup usage has no simulation_id' using errcode = '23514';
  end if;
  if v_task::text in ('buyer', 'evaluator') then
    if v_sim is null then
      raise exception 'simulation_id is required for % usage', v_task using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.practice_sessions s where s.id = v_sim and s.organization_id = v_org
    ) then
      raise exception 'simulation does not belong to the organization' using errcode = '23514';
    end if;
  end if;

  insert into public.ai_usage (
    organization_id, user_id, task, model, simulation_id, input_tokens, output_tokens, latency_ms,
    first_chunk_ms, estimated_cost_usd, outcome, attempt
  ) values (
    v_org,
    v_user,
    v_task,
    p_row ->> 'model',
    v_sim,
    coalesce((p_row ->> 'input_tokens')::int, 0),
    coalesce((p_row ->> 'output_tokens')::int, 0),
    coalesce((p_row ->> 'latency_ms')::int, 0),
    (p_row ->> 'first_chunk_ms')::int,
    coalesce((p_row ->> 'estimated_cost_usd')::numeric, 0),
    coalesce((p_row ->> 'outcome')::public.ai_call_outcome, 'success'),
    coalesce((p_row ->> 'attempt')::smallint, 1)
  );
end;
$$;

revoke all on function private.practice_quota_status(uuid) from public;
revoke all on function private.initial_interest(int) from public;
revoke all on function private.mood(int) from public;
revoke all on function public.insert_ai_usage(jsonb) from public, anon, authenticated;
grant execute on function private.practice_quota_status(uuid) to service_role;
grant execute on function private.initial_interest(int) to service_role;
grant execute on function private.mood(int) to service_role;
grant execute on function public.insert_ai_usage(jsonb) to service_role;

-- Rate-limit scopes of 002 --------------------------------------------------------------------------------
alter table private.rate_limit_events drop constraint rate_limit_events_scope_valid;
alter table private.rate_limit_events add constraint rate_limit_events_scope_valid check (scope in (
  'login_account', 'login_ip', 'mfa_verify', 'recovery_email', 'activation_ip',
  'access_request_ip', 'webhook_id', 'user_mutation', 'practice_turn', 'practice_status'
));
