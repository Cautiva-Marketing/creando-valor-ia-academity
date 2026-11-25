-- Migration: admin simulation counts from simulation_consumptions (T075, research.md §R7).
-- A simulation is counted when it was started (FR-018), not when AI usage exists: a configured
-- persona that never started has ai_usage (buyer_setup) but no consumption. Signatures unchanged.
--
-- Rollback: re-run the definitions of 20261123001300_organization_admin_functions.sql.

create or replace function public.admin_list_organizations(
  p_q text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  type public.organization_type,
  status public.organization_status,
  suspended_reason text,
  created_at timestamptz,
  daily_limit int,
  monthly_limit int,
  month_simulations bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_pattern text;
begin
  perform private.require_superadmin();
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid pagination' using errcode = '22023';
  end if;
  v_pattern := '%' || replace(replace(replace(lower(coalesce(v_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select o.id, o.name, o.type, o.status, o.suspended_reason, o.created_at,
         q.daily_limit, q.monthly_limit,
         (select count(*)
            from public.simulation_consumptions c
           where c.organization_id = o.id
             and c.consumed_at >= (date_trunc('month', now() at time zone o.timezone) at time zone o.timezone)),
         count(*) over ()
    from public.organizations o
    left join public.quotas q on q.organization_id = o.id
   where v_q is null or lower(o.name) like v_pattern or o.slug like v_pattern
   order by o.created_at desc, o.id
   limit p_limit offset p_offset;
end;
$$;

-- Usage summary: local days of each organization's time zone. Simulations from
-- simulation_consumptions; tokens and cost from ai_usage (no conversation content, FR-006 of 001).
create or replace function public.admin_usage_summary(p_from date, p_to date)
returns table (
  organization_id uuid,
  organization_name text,
  simulations bigint,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Coarse UTC window (uses the indexes; ±14 h covers every time zone), then the exact local day.
  v_from timestamptz := (p_from::timestamp - interval '14 hours') at time zone 'UTC';
  v_to timestamptz := ((p_to + 1)::timestamp + interval '14 hours') at time zone 'UTC';
begin
  perform private.require_superadmin();
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  return query
  with usage as (
    select u.organization_id as org,
           sum(u.input_tokens)::bigint as input_tokens,
           sum(u.output_tokens)::bigint as output_tokens,
           sum(u.estimated_cost_usd)::numeric as cost
      from public.ai_usage u
      join public.organizations o on o.id = u.organization_id
     where u.created_at >= v_from and u.created_at < v_to
       and (u.created_at at time zone o.timezone)::date between p_from and p_to
     group by u.organization_id
  ),
  consumed as (
    select c.organization_id as org, count(*)::bigint as simulations
      from public.simulation_consumptions c
      join public.organizations o on o.id = c.organization_id
     where c.consumed_at >= v_from and c.consumed_at < v_to
       and (c.consumed_at at time zone o.timezone)::date between p_from and p_to
     group by c.organization_id
  )
  select o.id, o.name,
         coalesce(c.simulations, 0),
         coalesce(u.input_tokens, 0),
         coalesce(u.output_tokens, 0),
         coalesce(u.cost, 0)
    from usage u
    full join consumed c on c.org = u.org
    join public.organizations o on o.id = coalesce(u.org, c.org)
   order by coalesce(u.cost, 0) desc, o.name;
end;
$$;

revoke all on function public.admin_list_organizations(text, int, int) from public, anon;
revoke all on function public.admin_usage_summary(date, date) from public, anon;
grant execute on function public.admin_list_organizations(text, int, int) to authenticated;
grant execute on function public.admin_usage_summary(date, date) to authenticated;
