-- Migration: rate limiting in Postgres (T019) — research.md §R9
--
-- Rollback:
--   select cron.unschedule('purge-rate-limit-events');
--   drop function if exists public.check_rate_limit(text, bytea, int, interval, interval),
--     public.record_rate_limit_event(text, bytea), private.check_rate_limit(...),
--     private.record_rate_limit_event(...), private.purge_rate_limit_events();

-- Returns whether a new attempt is allowed. Does NOT record an event.
-- Blocked when at least p_max events exist inside p_window. retry_after is the later of:
--   * when the window drops below p_max events ("hasta salir de la ventana"), and
--   * p_lockout after the most recent event ("15 min desde el último fallo").
create or replace function private.check_rate_limit(
  p_scope text,
  p_key bytea,
  p_max integer,
  p_window interval,
  p_lockout interval default null
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_last timestamptz;
  v_window_exit timestamptz;
  v_until timestamptz;
begin
  if p_max is null or p_max < 1 or p_window is null then
    raise exception 'invalid rate limit configuration' using errcode = '22023';
  end if;

  select count(*), max(e.occurred_at)
    into v_count, v_last
    from private.rate_limit_events e
   where e.scope = p_scope and e.key_hash = p_key and e.occurred_at > now() - p_window;

  if v_count < p_max then
    return query select true, 0;
    return;
  end if;

  select e.occurred_at + p_window
    into v_window_exit
    from private.rate_limit_events e
   where e.scope = p_scope and e.key_hash = p_key and e.occurred_at > now() - p_window
   order by e.occurred_at desc
   offset p_max - 1
   limit 1;

  v_until := greatest(v_window_exit, v_last + coalesce(p_lockout, interval '0'));
  return query select false, greatest(1, ceil(extract(epoch from (v_until - now())))::integer);
end;
$$;

create or replace function private.record_rate_limit_event(p_scope text, p_key bytea)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.rate_limit_events (scope, key_hash) values (p_scope, p_key);
$$;

create or replace function private.purge_rate_limit_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from private.rate_limit_events where occurred_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.check_rate_limit(text, bytea, integer, interval, interval) from public;
revoke all on function private.record_rate_limit_event(text, bytea) from public;
revoke all on function private.purge_rate_limit_events() from public;

-- Public wrappers: `private` is not exposed by PostgREST. service_role only.
create or replace function public.check_rate_limit(
  p_scope text,
  p_key bytea,
  p_max integer,
  p_window interval,
  p_lockout interval default null
)
returns table (allowed boolean, retry_after_seconds integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.check_rate_limit(p_scope, p_key, p_max, p_window, p_lockout);
$$;

create or replace function public.record_rate_limit_event(p_scope text, p_key bytea)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.record_rate_limit_event(p_scope, p_key);
$$;

revoke all on function public.check_rate_limit(text, bytea, integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.record_rate_limit_event(text, bytea) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, bytea, integer, interval, interval) to service_role;
grant execute on function public.record_rate_limit_event(text, bytea) to service_role;

-- Daily purge (> 7 days) -----------------------------------------------------------------------
select cron.schedule(
  'purge-rate-limit-events',
  '10 8 * * *',
  $$select private.purge_rate_limit_events();$$
);
