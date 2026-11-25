-- Migration: practice history and stage averages (US8, US9; contracts/database-rpc.md; FR-049–FR-052)
-- Both are `security invoker`: RLS limits them to the caller's own sessions in active organizations.
-- Dates are compared in the organization's time zone.
-- Rollback:
--   drop function if exists public.my_practice_history(date, date, uuid, smallint, int, int),
--     public.my_practice_stage_averages(date, date, uuid, smallint, int);

-- my_practice_history ---------------------------------------------------------------------------------
-- Started sessions only (active, finalized, evaluated), newest first, with the product name of the
-- version used and `total_count` of the filtered set for pagination.
create or replace function public.my_practice_history(
  p_from date default null,
  p_to date default null,
  p_product uuid default null,
  p_difficulty smallint default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  session_id uuid,
  product_id uuid,
  product_name text,
  product_version int,
  difficulty smallint,
  started_at timestamptz,
  status public.practice_status,
  evaluation_status public.evaluation_status,
  total_score smallint,
  level public.score_level,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.product_id, v.name, s.product_version::int, s.difficulty, s.started_at, s.status,
         s.evaluation_status, e.total_score, e.level, count(*) over ()
    from public.practice_sessions s
    join public.organizations o on o.id = s.organization_id
    join public.product_versions v on v.id = s.product_version_id
    left join public.practice_evaluations e on e.session_id = s.id
   where s.user_id = (select auth.uid())
     and s.status in ('active', 'finalized', 'evaluated')
     and s.started_at is not null
     and (p_product is null or s.product_id = p_product)
     and (p_difficulty is null or s.difficulty = p_difficulty)
     and (p_from is null or (s.started_at at time zone o.timezone)::date >= p_from)
     and (p_to is null or (s.started_at at time zone o.timezone)::date <= p_to)
   order by s.started_at desc, s.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- my_practice_stage_averages --------------------------------------------------------------------------
-- Average percentage (score / max · 100) of the evaluated criteria of each C.A.U.T.I.V.A.™ stage over
-- the caller's evaluated sessions (filtered, or the last `p_last_n`). A criterion shared by several
-- stages counts in each. Stages without data → avg_pct NULL. Canonical order (enum order).
create or replace function public.my_practice_stage_averages(
  p_from date default null,
  p_to date default null,
  p_product uuid default null,
  p_difficulty smallint default null,
  p_last_n int default null
)
returns table (stage public.cautiva_stage, avg_pct numeric, evaluated_criteria int)
language sql
stable
security invoker
set search_path = ''
as $$
  with sessions as (
    select s.id
      from public.practice_sessions s
      join public.organizations o on o.id = s.organization_id
     where s.user_id = (select auth.uid())
       and s.status = 'evaluated'
       and (p_product is null or s.product_id = p_product)
       and (p_difficulty is null or s.difficulty = p_difficulty)
       and (p_from is null or (s.started_at at time zone o.timezone)::date >= p_from)
       and (p_to is null or (s.started_at at time zone o.timezone)::date <= p_to)
     order by s.started_at desc, s.id desc
     limit case when p_last_n is null or p_last_n < 1 then null else p_last_n end
  ),
  scores as (
    select st.stage, c.score::numeric * 100 / c.max_score as pct
      from sessions x
      join public.practice_evaluations e on e.session_id = x.id
      join public.practice_evaluation_criteria c on c.evaluation_id = e.id
      join public.rubric_criteria rc on rc.id = c.criterion_id
      cross join lateral unnest(rc.stages) as st(stage)
     where c.status = 'evaluated' and c.score is not null and c.max_score > 0
  )
  select g.stage, round(avg(sc.pct), 1), count(sc.pct)::int
    from unnest(enum_range(null::public.cautiva_stage)) with ordinality as g(stage, ord)
    left join scores sc on sc.stage = g.stage
   group by g.stage, g.ord
   order by g.ord;
$$;

revoke all on function public.my_practice_history(date, date, uuid, smallint, int, int) from public, anon;
revoke all on function public.my_practice_stage_averages(date, date, uuid, smallint, int) from public, anon;
grant execute on function public.my_practice_history(date, date, uuid, smallint, int, int) to authenticated;
grant execute on function public.my_practice_stage_averages(date, date, uuid, smallint, int) to authenticated;
