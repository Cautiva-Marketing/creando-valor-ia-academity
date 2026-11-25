-- Migration: practice maintenance v3 (T142) — research.md §R8; FR-043, SC-002. Adds to v2
-- (20261124002100):
--   * evaluations past `evaluation_due_at` → failed (or unavailable after the 3rd manual retry);
--   * organizations suspended: their evaluations are deferred (not evaluated until reactivated);
--   * dispatcher: up to 5 `pending` evaluations older than 20 s are sent with pg_net to
--     `{practice_dispatch_url}/api/internal/practice/evaluations` with the Bearer
--     `practice_dispatch_secret`. Both values live only in Supabase Vault (seed.sql locally,
--     scripts/ops/set-practice-dispatch.ts in production); without them nothing is dispatched.
--
-- Rollback: re-run the v2 definition of 20261124002100_practice_maintenance_v2.sql.

create or replace function private.run_practice_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_ids uuid[];
  v_url text;
  v_secret text;
begin
  -- Time limit: active sessions whose deadline passed, even if nobody opens them.
  for v_session in
    select s.id from public.practice_sessions s
     where s.status = 'active' and s.deadline_at <= now()
     for update skip locked
  loop
    perform private.close_practice_by_time(v_session);
  end loop;

  -- Expired turn leases (the process that held them died): the seller message stays unanswered.
  update public.practice_sessions s
     set turn_lock_seq = null, turn_lock_expires_at = null
   where s.status = 'active' and s.turn_lock_expires_at <= now();

  -- Suspended organizations: their evaluations wait (deadline pushed) instead of failing.
  update public.practice_sessions s
     set evaluation_status = 'pending', evaluation_phase = null,
         evaluation_due_at = now() + interval '3 minutes'
    from public.organizations o
   where o.id = s.organization_id and o.status = 'suspended'
     and s.evaluation_status in ('pending', 'in_progress')
     and s.evaluation_due_at <= now() + interval '1 minute';

  -- Evaluations past their deadline (3 min) → failed, or unavailable after the 3rd manual retry.
  update public.practice_sessions s
     set evaluation_status = case when s.evaluation_manual_retries >= 3 then 'unavailable' else 'failed' end::public.evaluation_status,
         evaluation_phase = null,
         evaluation_due_at = null,
         evaluation_failure_code = coalesce(s.evaluation_failure_code, 'timeout')
   where s.evaluation_status in ('pending', 'in_progress') and s.evaluation_due_at <= now();

  -- Configured sessions past 24 h (FR-015).
  update public.practice_sessions s
     set status = 'discarded', discarded_at = now()
   where s.status = 'configured' and s.configured_expires_at <= now();

  -- Setup attempts are only needed for today's caps (FR-016).
  delete from public.practice_setup_attempts a where a.created_at < now() - interval '40 days';

  -- Dispatcher: pending evaluations the immediate trigger did not take (pending for > 20 s).
  select array_agg(x.id) into v_ids from (
    select s.id
      from public.practice_sessions s
      join public.organizations o on o.id = s.organization_id
     where s.evaluation_status = 'pending' and o.status = 'active'
       and s.evaluation_due_at <= now() + interval '160 seconds'
     order by s.evaluation_due_at
     limit 5
  ) x;
  if v_ids is null then
    return;
  end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'practice_dispatch_url';
  select d.decrypted_secret into v_secret from vault.decrypted_secrets d where d.name = 'practice_dispatch_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/internal/practice/evaluations',
    body := jsonb_build_object('sessionIds', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.run_practice_maintenance() from public;
