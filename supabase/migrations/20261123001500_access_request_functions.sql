-- Migration: access request administration and retention (T156) — contracts/database-rpc.md,
-- data-model.md `access_requests`, research.md §R12 (FR-049a).
--
-- Rollback:
--   select cron.unschedule('access-request-retention');
--   drop function if exists public.admin_discard_access_request(uuid), private.run_access_request_retention();

-- Manual discard (superadmin aal2): only from `new`; audits access_request.discarded {automatic:false}.
create or replace function public.admin_discard_access_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_superadmin();
  v_request public.access_requests%rowtype;
begin
  select * into v_request from public.access_requests r where r.id = p_id for update;
  if not found then
    raise exception 'access request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'new' or v_request.anonymized_at is not null then
    raise exception 'access request not discardable' using errcode = 'P0010';
  end if;

  update public.access_requests
     set status = 'discarded',
         discarded_at = now(),
         discarded_by_system = false,
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_id;

  perform private.write_audit(
    'user', v_uid, null, null, 'access_request.discarded', 'access_request', p_id::text,
    jsonb_build_object('automatic', false), 'success'
  );
end;
$$;

revoke all on function public.admin_discard_access_request(uuid) from public, anon;
grant execute on function public.admin_discard_access_request(uuid) to authenticated;

-- Daily retention: (a) `new` older than 180 days → discarded by the system (audited, actor system);
-- (b) discarded more than 90 days ago → personal data removed; (c) `invited` is kept.
create or replace function private.run_access_request_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_discarded int := 0;
  v_anonymized int := 0;
begin
  for v_row in
    update public.access_requests
       set status = 'discarded',
           discarded_at = now(),
           discarded_by_system = true,
           reviewed_by = null,
           reviewed_at = now()
     where status = 'new'
       and anonymized_at is null
       and created_at < now() - interval '180 days'
    returning id
  loop
    perform private.write_audit(
      'system', null, 'retención automática', null, 'access_request.discarded', 'access_request', v_row.id::text,
      jsonb_build_object('automatic', true), 'success'
    );
    v_discarded := v_discarded + 1;
  end loop;

  update public.access_requests
     set full_name = null,
         email = null,
         company_or_role = null,
         message = null,
         anonymized_at = now()
   where status = 'discarded'
     and anonymized_at is null
     and discarded_at < now() - interval '90 days';
  get diagnostics v_anonymized = row_count;

  return jsonb_build_object('discarded', v_discarded, 'anonymized', v_anonymized);
end;
$$;

revoke all on function private.run_access_request_retention() from public, anon, authenticated;
grant execute on function private.run_access_request_retention() to service_role;

select cron.schedule(
  'access-request-retention',
  '15 8 * * *',
  $$select private.run_access_request_retention();$$
);
