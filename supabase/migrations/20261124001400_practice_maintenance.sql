-- Migration: practice maintenance v1 (T076) — contracts/database-rpc.md → private.run_practice_maintenance.
-- v1 discards configured sessions older than 24 h (FR-015) and purges setup attempts older than 40
-- days (FR-016 only needs today). Later tasks (T097, T117) extend it with time limits, leases and
-- evaluation dispatch.
--
-- Rollback:
--   select cron.unschedule('practice-maintenance');
--   drop function if exists private.run_practice_maintenance();

create or replace function private.run_practice_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.practice_sessions s
     set status = 'discarded', discarded_at = now()
   where s.status = 'configured' and s.configured_expires_at <= now();

  delete from public.practice_setup_attempts a where a.created_at < now() - interval '40 days';
end;
$$;

revoke all on function private.run_practice_maintenance() from public;

select cron.schedule(
  'practice-maintenance',
  '* * * * *',
  $$ select private.run_practice_maintenance(); $$
);
