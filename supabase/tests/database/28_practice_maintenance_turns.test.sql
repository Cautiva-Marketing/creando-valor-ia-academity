-- T093 — maintenance v2 (research.md §R8; FR-028d): active sessions past their deadline are closed by
-- time_limit even if nobody opens them (pending with seller messages, not_applicable without), also in
-- suspended organizations (no AI involved); expired turn leases are released.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.products (id, organization_id, created_by, current_name)
values ('00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013', 'Curso'),
       ('00000000-0000-4000-9100-000000000d01', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-a000-000000000014', 'Curso D');
insert into public.product_versions (id, organization_id, product_id, version, sector, name, price_kind, price_min, price_max, benefits, created_by)
values ('00000000-0000-4000-9200-000000000c01', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-9100-000000000c01', 1,
        'education', 'Curso', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000013'),
       ('00000000-0000-4000-9200-000000000d01', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-9100-000000000d01', 1,
        'education', 'Curso D', 'fixed', 100, 100, array['B'], '00000000-0000-4000-a000-000000000014');

create function pg_temp.active(p_id uuid, p_org uuid, p_user uuid, p_product uuid, p_version uuid, p_deadline interval, p_seller int)
returns void
language sql
as $$
  insert into public.practice_sessions (id, organization_id, user_id, product_id, product_version_id, product_version,
    status, difficulty, selected_objection_ids, visible_objection, interest, setup_idempotency_key, configured_at,
    configured_expires_at, started_at, deadline_at, last_seq, seller_message_count,
    buyer_setup_prompt_version, buyer_prompt_version, buyer_setup_model, buyer_model)
  values (p_id, p_org, p_user, p_product, p_version, 1, 'active', 3, array[gen_random_uuid()], 'Objeción visible', 45,
    gen_random_uuid(), now() - interval '30 minutes', now() + interval '1 day', now() - interval '25 minutes',
    now() + p_deadline, 1, p_seller, 'v', 'v', 'm', 'm');
$$;

-- C: one session past its deadline with seller messages, then (after it closes) one without.
select pg_temp.active('00000000-0000-4000-9000-000000000c21', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', '-1 minute', 3);
-- D (organization suspended in the seed): its session also runs out.
select pg_temp.active('00000000-0000-4000-9000-000000000d21', '00000000-0000-4000-b000-00000000000d', '00000000-0000-4000-a000-000000000014',
  '00000000-0000-4000-9100-000000000d01', '00000000-0000-4000-9200-000000000d01', '-1 minute', 2);

select lives_ok($$ select private.run_practice_maintenance() $$, 'maintenance runs');
select results_eq(
  $$ select status::text, end_reason::text, evaluation_status::text, evaluation_due_at is not null
       from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c21' $$,
  $$ values ('finalized', 'time_limit', 'pending', true) $$, 'past deadline with seller messages → time_limit + pending');
select results_eq(
  $$ select status::text, end_reason::text, evaluation_status::text from public.practice_sessions
      where id = '00000000-0000-4000-9000-000000000d21' $$,
  $$ values ('finalized', 'time_limit', 'pending') $$, 'also closed in a suspended organization (no AI involved)');

select pg_temp.active('00000000-0000-4000-9000-000000000c22', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', '-1 second', 0);
select private.run_practice_maintenance();
select results_eq(
  $$ select status::text, end_reason::text, evaluation_status::text, evaluation_due_at from public.practice_sessions
      where id = '00000000-0000-4000-9000-000000000c22' $$,
  $$ values ('finalized', 'time_limit', 'not_applicable', null::timestamptz) $$, 'without seller messages → not_applicable');

-- Expired lease on a session still in time: released; a valid lease is kept.
select pg_temp.active('00000000-0000-4000-9000-000000000c23', '00000000-0000-4000-b000-00000000000c', '00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-9100-000000000c01', '00000000-0000-4000-9200-000000000c01', '10 minutes', 1);
update public.practice_sessions set turn_lock_seq = 2, turn_lock_expires_at = now() - interval '1 second'
 where id = '00000000-0000-4000-9000-000000000c23';
select private.run_practice_maintenance();
select results_eq(
  $$ select status::text, turn_lock_seq, turn_lock_expires_at from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c23' $$,
  $$ values ('active', null::int, null::timestamptz) $$, 'expired lease released; the session stays active');
update public.practice_sessions set turn_lock_seq = 2, turn_lock_expires_at = now() + interval '60 seconds'
 where id = '00000000-0000-4000-9000-000000000c23';
select private.run_practice_maintenance();
select is((select turn_lock_seq from public.practice_sessions where id = '00000000-0000-4000-9000-000000000c23'), 2,
  'a lease still valid is kept');
select is((select count(*)::int from public.practice_sessions where status = 'active' and deadline_at <= now()), 0,
  'no active session past its deadline remains');

select * from finish();
rollback;
