-- Migration: organization administration and AI usage (T132) — contracts/database-rpc.md,
-- data-model.md (quotas, organizations.suspended_*, ai_usage). Every function requires superadmin aal2.
-- Rollback:
--   drop function if exists public.admin_list_organizations(text, int, int);
--   drop function if exists public.admin_update_quota(uuid, int, int);
--   drop function if exists public.admin_set_organization_status(uuid, public.organization_status, text);
--   drop function if exists public.admin_usage_summary(date, date);

-- List with quota and current-month simulations (month in each organization's time zone) ------------
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
         (select count(distinct u.simulation_id)
            from public.ai_usage u
           where u.organization_id = o.id
             and u.created_at >= (date_trunc('month', now() at time zone o.timezone) at time zone o.timezone)),
         count(*) over ()
    from public.organizations o
    left join public.quotas q on q.organization_id = o.id
   where v_q is null or lower(o.name) like v_pattern or o.slug like v_pattern
   order by o.created_at desc, o.id
   limit p_limit offset p_offset;
end;
$$;

-- Quota ------------------------------------------------------------------------------------------------
create or replace function public.admin_update_quota(p_org uuid, p_daily int, p_monthly int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_superadmin();
  v_quota public.quotas%rowtype;
begin
  if p_daily is null or p_monthly is null or p_daily < 0 or p_monthly < 0 or p_daily > p_monthly then
    raise exception 'invalid quota' using errcode = '23514';
  end if;
  select * into v_quota from public.quotas q where q.organization_id = p_org for update;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  if v_quota.daily_limit = p_daily and v_quota.monthly_limit = p_monthly then
    return; -- no-op, no audit
  end if;

  update public.quotas
     set daily_limit = p_daily, monthly_limit = p_monthly, updated_at = now(), updated_by = v_uid
   where organization_id = p_org;

  perform private.write_audit(
    'user', v_uid, null, p_org, 'quota.updated', 'organization', p_org::text,
    jsonb_build_object(
      'before', jsonb_build_object('daily_limit', v_quota.daily_limit, 'monthly_limit', v_quota.monthly_limit),
      'after', jsonb_build_object('daily_limit', p_daily, 'monthly_limit', p_monthly)
    ),
    'success'
  );
end;
$$;

-- Suspend / reactivate -----------------------------------------------------------------------------------
create or replace function public.admin_set_organization_status(
  p_org uuid,
  p_status public.organization_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_superadmin();
  v_org public.organizations%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_status is null then
    raise exception 'status required' using errcode = '22023';
  end if;
  select * into v_org from public.organizations o where o.id = p_org for update;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  if v_org.status = p_status then
    raise exception 'organization already in that status' using errcode = 'P0010', detail = p_status::text;
  end if;

  if p_status = 'suspended' then
    if char_length(v_reason) < 1 or char_length(v_reason) > 500 then
      raise exception 'suspension reason must have 1 to 500 characters' using errcode = '23514';
    end if;
    update public.organizations
       set status = 'suspended', suspended_reason = v_reason, suspended_at = now(), suspended_by = v_uid
     where id = p_org;
    perform private.write_audit(
      'user', v_uid, null, p_org, 'organization.suspended', 'organization', p_org::text,
      jsonb_build_object('reason', v_reason), 'success'
    );
  else
    -- Reactivation keeps suspended_reason/at/by as the last suspension (data-model.md).
    update public.organizations set status = 'active' where id = p_org;
    perform private.write_audit(
      'user', v_uid, null, p_org, 'organization.reactivated', 'organization', p_org::text,
      jsonb_build_object('previous_reason', v_org.suspended_reason), 'success'
    );
  end if;
end;
$$;

-- Usage summary: local days of each organization's time zone; reads only organizations and ai_usage ----
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
begin
  perform private.require_superadmin();
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  return query
  select o.id, o.name,
         count(distinct u.simulation_id),
         coalesce(sum(u.input_tokens), 0)::bigint,
         coalesce(sum(u.output_tokens), 0)::bigint,
         coalesce(sum(u.estimated_cost_usd), 0)::numeric
    from public.ai_usage u
    join public.organizations o on o.id = u.organization_id
   -- Coarse UTC window (uses the index; ±14 h covers every time zone), then the exact local day.
   where u.created_at >= (p_from::timestamp - interval '14 hours') at time zone 'UTC'
     and u.created_at < ((p_to + 1)::timestamp + interval '14 hours') at time zone 'UTC'
     and (u.created_at at time zone o.timezone)::date between p_from and p_to
   group by o.id, o.name
   order by sum(u.estimated_cost_usd) desc, o.name;
end;
$$;

-- Grants -------------------------------------------------------------------------------------------------
revoke all on function public.admin_list_organizations(text, int, int) from public, anon;
revoke all on function public.admin_update_quota(uuid, int, int) from public, anon;
revoke all on function public.admin_set_organization_status(uuid, public.organization_status, text) from public, anon;
revoke all on function public.admin_usage_summary(date, date) from public, anon;
grant execute on function public.admin_list_organizations(text, int, int) to authenticated;
grant execute on function public.admin_update_quota(uuid, int, int) to authenticated;
grant execute on function public.admin_set_organization_status(uuid, public.organization_status, text) to authenticated;
grant execute on function public.admin_usage_summary(date, date) to authenticated;
