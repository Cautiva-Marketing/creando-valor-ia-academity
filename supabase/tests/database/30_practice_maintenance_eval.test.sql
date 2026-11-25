-- T133 — maintenance v3 (research.md §R8; FR-043, SC-002): evaluations past their deadline → failed
-- (or unavailable), suspended organizations are deferred, and pending evaluations older than 20 s are
-- dispatched with pg_net in batches of ≤ 5 with the Bearer from Vault (no secret outside Vault).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.products (id, organization_id, created_by, current_name)
values ('00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Curso'),
       ('00000000-0000-4000-9100-000000000d01', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-a000-000000000014', 'Curso D');
insert into public.product_versions (id, organization_id, product_id, version, sector, name, price_kind, price_min, price_max, benefits, created_by)
values ('00000000-0000-4000-9200-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 1,
        'education', 'Curso', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000013'),
       ('00000000-0000-4000-9200-000000000d01', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-9100-000000000d01', 1,
        'education', 'Curso D', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000014');

-- Finalized session whose evaluation entered `pending` p_age ago (deadline = start + 3 min).
create function pg_temp.finalized(p_id uuid, p_org uuid, p_user uuid, p_product uuid, p_version uuid,
  p_status public.evaluation_status, p_age interval, p_manual int default 0)
returns void
language sql
as $$
  insert into public.practice_sessions (id, organization_id, user_id, product_id, product_version_id, product_version,
    status, difficulty, selected_objection_ids, visible_objection, interest, setup_idempotency_key, configured_at,
    configured_expires_at, started_at, deadline_at, last_seq, seller_message_count, ended_at, end_reason,
    evaluation_status, evaluation_due_at, evaluation_manual_retries,
    buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model)
  values (p_id, p_org, p_user, p_product, p_version, 1, 'finalized', 3, array[gen_random_uuid()], 'Objeción visible', 45,
    gen_random_uuid(), now() - interval '30 minutes', now() + interval '1 day', now() - interval '25 minutes',
    now() - interval '5 minutes', 2, 1, now() - p_age, 'seller_ended',
    p_status, now() - p_age + interval '3 minutes', p_manual, 'v', 'v', 'm', 'm');
$$;

create function pg_temp.c(p_id uuid, p_status public.evaluation_status, p_age interval, p_manual int default 0)
returns void
language sql
as $$
  select pg_temp.finalized(p_id, '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
    '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', p_status, p_age, p_manual);
$$;

-- Org C: two expired (one after 3 manual retries), seven pending older than 20 s, one fresh.
select pg_temp.c('00000000-0000-4000-9000-000000000f01', 'in_progress', '4 minutes');
select pg_temp.c('00000000-0000-4000-9000-000000000f02', 'pending', '4 minutes', 3);
select pg_temp.c(('00000000-0000-4000-9000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'pending', (30 + n) * interval '1 second')
  from generate_series(1, 7) n;
select pg_temp.c('00000000-0000-4000-9000-000000000f03', 'pending', '5 seconds');
-- Org D (suspended): an expired evaluation is deferred, not failed and not dispatched.
select pg_temp.finalized('00000000-0000-4000-9000-000000000f04', '00000000-0000-4000-b000-00000000000d',
  '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-9100-000000000d01', '00000000-0000-4000-9200-000000000d01',
  'pending', '4 minutes');
update public.organizations set status = 'suspended', suspended_reason = 'x', suspended_at = now(),
  suspended_by = '00000000-0000-4000-a000-000000000001' where id = '00000000-0000-4000-b000-00000000000d';

create temp table q as select coalesce(max(id), 0) as last_id from net.http_request_queue;
select private.run_practice_maintenance();

select is((select evaluation_status || '|' || evaluation_failure_code || '|' || coalesce(evaluation_phase::text, '-')
             from public.practice_sessions where id = '00000000-0000-4000-9000-000000000f01'),
  'failed|timeout|-', 'evaluation past its deadline → failed (timeout)');
select is((select evaluation_status::text from public.practice_sessions where id = '00000000-0000-4000-9000-000000000f02'),
  'unavailable', 'past its deadline after 3 manual retries → unavailable');
select is((select evaluation_status || '|' || (evaluation_due_at > now())
             from public.practice_sessions where id = '00000000-0000-4000-9000-000000000f04'),
  'pending|true', 'suspended organization → deferred, still pending');

select is((select count(*)::int from net.http_request_queue r where r.id > (select last_id from q)), 1,
  'one dispatch request per run');
select is((select r.method::text || ' ' || r.url from net.http_request_queue r where r.id > (select last_id from q)),
  'POST http://host.docker.internal:3000/api/internal/practice/evaluations', 'POST to the internal dispatcher');
select is((select r.headers ->> 'Authorization' from net.http_request_queue r where r.id > (select last_id from q)),
  'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'practice_dispatch_secret'),
  'Bearer secret taken from Vault');
select is((select jsonb_array_length(convert_from(r.body, 'utf8')::jsonb -> 'sessionIds')
             from net.http_request_queue r where r.id > (select last_id from q)), 5, 'batch of at most 5 ids');
select ok((select not (convert_from(r.body, 'utf8')::jsonb -> 'sessionIds' ?| array[
             '00000000-0000-4000-9000-000000000f03', '00000000-0000-4000-9000-000000000f04'])
             from net.http_request_queue r where r.id > (select last_id from q)),
  'neither fresh (< 20 s) nor suspended evaluations are dispatched');
select ok(position((select decrypted_secret from vault.decrypted_secrets where name = 'practice_dispatch_secret')
            in pg_get_functiondef('private.run_practice_maintenance()'::regprocedure)) = 0,
  'the secret is not written in the function');

-- Without the Vault secrets nothing is dispatched.
delete from vault.secrets where name in ('practice_dispatch_url', 'practice_dispatch_secret');
truncate q;
insert into q select coalesce(max(id), 0) from net.http_request_queue;
select private.run_practice_maintenance();
select is((select count(*)::int from net.http_request_queue r where r.id > (select last_id from q)), 0,
  'no dispatch without Vault secrets');

select * from finish();
rollback;
