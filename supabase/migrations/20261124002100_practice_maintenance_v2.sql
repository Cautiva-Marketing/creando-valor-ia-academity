-- Migration: practice maintenance v2 (T102) — adds the time limit close (FR-028d) and the release of
-- expired turn leases to v1 (20261124001400). Sessions of suspended organizations are closed too:
-- closing never calls the AI; their evaluation stays `pending` and is deferred (T142).
--
-- Rollback: re-run the v1 definition of 20261124001400_practice_maintenance.sql.

create or replace function private.run_practice_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
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

  -- Configured sessions past 24 h (FR-015).
  update public.practice_sessions s
     set status = 'discarded', discarded_at = now()
   where s.status = 'configured' and s.configured_expires_at <= now();

  -- Setup attempts are only needed for today's caps (FR-016).
  delete from public.practice_setup_attempts a where a.created_at < now() - interval '40 days';
end;
$$;

revoke all on function private.run_practice_maintenance() from public;
