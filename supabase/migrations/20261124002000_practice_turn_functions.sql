-- Migration: practice turns (T101) — contracts/database-rpc.md → begin/commit/release turn,
-- finish_practice_session, request_practice_hint, get_practice_turn_context; data-model.md →
-- "Funciones de dominio en SQL" (private.apply_turn_rules). FR-020–FR-034, SC-009.
--
-- Deviation from the contract (documented in tasks.md T101): begin_practice_turn cannot close an
-- expired session AND raise P0010 in the same transaction (the exception would roll the close back).
-- It closes the session and returns `closed = true`; the route answers 409 conflict/not_active.
--
-- Rollback:
--   drop function if exists public.begin_practice_turn(uuid, uuid, text),
--     public.commit_practice_turn(uuid, uuid, int, text, jsonb, public.turn_meta_status, int),
--     public.release_practice_turn(uuid, uuid, int, int), public.finish_practice_session(uuid),
--     public.request_practice_hint(uuid), public.get_practice_turn_context(uuid, uuid),
--     private.apply_turn_rules(int, int, int, boolean, boolean, text),
--     private.practice_public_state(uuid), private.close_practice_by_time(uuid),
--     private.assert_practice_owner(uuid, uuid);

-- Rules of a buyer turn (FR-027, FR-028, FR-034) ----------------------------------------------------
-- p_seller_count already includes the seller message being answered.
create or replace function private.apply_turn_rules(
  p_interest int,
  p_seller_count int,
  p_delta int,
  p_abusive boolean,
  p_end boolean,
  p_end_reason text
)
returns table (interest_after int, interest_delta int, end_reason public.practice_end_reason, corrected boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_delta int := coalesce(p_delta, 0);
  v_abusive boolean := coalesce(p_abusive, false);
begin
  corrected := false;
  if v_delta > 15 or v_delta < -15 then
    v_delta := greatest(-15, least(15, v_delta));
    corrected := true;
  end if;
  interest_after := greatest(0, least(100, p_interest + v_delta));
  -- Floor of 11 in the first 3 seller messages unless the seller was abusive.
  if p_seller_count <= 3 and not v_abusive then
    interest_after := greatest(interest_after, 11);
  end if;
  interest_delta := greatest(-15, least(15, interest_after - p_interest));

  end_reason := null;
  if interest_after <= 10 and (p_seller_count >= 4 or v_abusive) then
    end_reason := 'buyer_abandoned';
  elsif coalesce(p_end, false) and p_end_reason = 'goal_achieved' then
    if interest_after >= 80 then
      end_reason := 'goal_achieved';
    else
      corrected := true; -- goal claimed below "Listo para avanzar": ignored
    end if;
  elsif coalesce(p_end, false) and p_end_reason = 'buyer_abandoned' then
    corrected := true; -- abandonment only when the rules allow it
  end if;
  if end_reason is null and p_seller_count >= 20 then
    end_reason := 'message_limit';
  end if;
  return next;
end;
$$;

-- Owner check for service_role functions: the session belongs to p_user and the org is active. --------
create or replace function private.assert_practice_owner(p_user uuid, p_session uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select s.organization_id into v_org from public.practice_sessions s
   where s.id = p_session and s.user_id = p_user;
  if v_org is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_org <> private.practice_org_for(p_user) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Public state of an active or finished session (contracts/route-handlers.md → state). Never secrets
-- that were not revealed: reveal values are copies made when they were discovered. -----------------
create or replace function private.practice_public_state(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'interest', s.interest,
    'mood', private.mood(s.interest),
    'lastDelta', s.last_interest_delta,
    'sellerMessageCount', s.seller_message_count,
    'messagesLeft', greatest(0, 20 - s.seller_message_count),
    'deadlineAt', s.deadline_at,
    'reveals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', r.kind, 'key', r.item_key, 'value', r.value, 'messageSeq', r.message_seq)
             order by r.message_seq, r.kind, r.item_key)
        from public.practice_session_reveals r where r.session_id = s.id), '[]'::jsonb),
    'turnInProgress', s.turn_lock_seq is not null and s.turn_lock_expires_at > now(),
    'hintAvailable', s.status = 'active' and s.hints_enabled
                     and s.last_hint_at_seller_count is distinct from s.seller_message_count
  )
  from public.practice_sessions s
  where s.id = p_session;
$$;

-- Closes an active session whose time ran out (FR-028d). Used by turns and maintenance. -----------------
create or replace function private.close_practice_by_time(p_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.practice_sessions s
     set status = 'finalized',
         end_reason = 'time_limit',
         ended_at = now(),
         turn_lock_seq = null,
         turn_lock_expires_at = null,
         evaluation_status = case when s.seller_message_count > 0 then 'pending' else 'not_applicable' end::public.evaluation_status,
         evaluation_due_at = case when s.seller_message_count > 0 then now() + interval '3 minutes' end
   where s.id = p_session and s.status = 'active';
$$;

-- begin_practice_turn (authenticated) -----------------------------------------------------------------
create or replace function public.begin_practice_turn(p_session uuid, p_client_message_id uuid, p_text text)
returns table (seller_seq int, already_answered boolean, buyer_seq int, closed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session public.practice_sessions;
  v_existing public.practice_messages;
  v_reply int;
  v_text text := btrim(coalesce(p_text, ''));
  v_seq int;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_session from public.practice_sessions s
   where s.id = p_session and s.user_id = v_uid for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_session.organization_id);
  if p_client_message_id is null then
    raise exception 'invalid client message id' using errcode = '22023';
  end if;

  select * into v_existing from public.practice_messages m
   where m.session_id = v_session.id and m.client_message_id = p_client_message_id;
  if v_existing.id is not null then
    select m.seq into v_reply from public.practice_messages m
     where m.session_id = v_session.id and m.author = 'buyer' and m.reply_to_seq = v_existing.seq;
    if v_reply is not null then
      return query select v_existing.seq, true, v_reply, false;
      return;
    end if;
  elsif char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid text' using errcode = '23514', detail = 'text';
  end if;

  if v_session.status <> 'active' then
    raise exception 'not_active' using errcode = 'P0010', detail = 'not_active';
  end if;
  if v_session.deadline_at <= now() then
    perform private.close_practice_by_time(v_session.id);
    return query select null::int, false, null::int, true;
    return;
  end if;
  if v_session.turn_lock_seq is not null and v_session.turn_lock_expires_at > now()
     and v_session.turn_lock_seq is distinct from v_existing.seq then
    raise exception 'turn_in_progress' using errcode = 'P0010', detail = 'turn_in_progress';
  end if;

  if v_existing.id is not null then
    v_seq := v_existing.seq;
  else
    if v_session.seller_message_count >= 20 then
      raise exception 'message_limit' using errcode = 'P0010', detail = 'message_limit';
    end if;
    v_seq := v_session.last_seq + 1;
    insert into public.practice_messages (organization_id, user_id, session_id, seq, author, content, client_message_id)
    values (v_session.organization_id, v_uid, v_session.id, v_seq, 'seller', v_text, p_client_message_id);
    update public.practice_sessions s
       set last_seq = v_seq, seller_message_count = s.seller_message_count + 1
     where s.id = v_session.id;
  end if;

  update public.practice_sessions s
     set turn_lock_seq = v_seq, turn_lock_expires_at = now() + interval '90 seconds'
   where s.id = v_session.id;
  return query select v_seq, false, null::int, false;
end;
$$;

-- get_practice_turn_context (service_role) ------------------------------------------------------------
create or replace function public.get_practice_turn_context(p_user uuid, p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.assert_practice_owner(p_user, p_session);
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'status', s.status, 'difficulty', s.difficulty, 'hintsEnabled', s.hints_enabled,
      'focusStage', s.focus_stage, 'interest', s.interest, 'sellerMessageCount', s.seller_message_count,
      'lastSeq', s.last_seq, 'deadlineAt', s.deadline_at, 'turnLockSeq', s.turn_lock_seq,
      'visibleObjection', s.visible_objection, 'visibleObjectionCategory', s.visible_objection_category,
      'organizationId', s.organization_id, 'buyerPromptVersion', s.buyer_prompt_version),
    'buyer', jsonb_build_object(
      'name', p.name, 'age', p.age, 'occupation', p.occupation, 'intro', p.intro, 'goal', p.goal,
      'motivation', sec.motivation, 'personality', sec.personality),
    'revealables', sec.revealables,
    'hiddenObjections', sec.hidden_objections,
    'product', jsonb_build_object(
      'sector', v.sector, 'name', v.name, 'description', v.description, 'priceKind', v.price_kind,
      'priceMin', v.price_min, 'priceMax', v.price_max, 'benefits', to_jsonb(v.benefits),
      'differentiators', to_jsonb(v.differentiators), 'verifiableFacts', to_jsonb(v.verifiable_facts)),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('seq', m.seq, 'author', m.author, 'content', m.content) order by m.seq)
        from public.practice_messages m where m.session_id = s.id), '[]'::jsonb),
    'reveals', coalesce((
      select jsonb_agg(jsonb_build_object('kind', r.kind, 'key', r.item_key, 'messageSeq', r.message_seq))
        from public.practice_session_reveals r where r.session_id = s.id), '[]'::jsonb)
  ) into v_result
  from public.practice_sessions s
  join public.practice_buyer_profiles p on p.session_id = s.id
  join public.practice_session_secrets sec on sec.session_id = s.id
  join public.product_versions v on v.id = s.product_version_id
  where s.id = p_session;
  return v_result;
end;
$$;

-- commit_practice_turn (service_role) ---------------------------------------------------------------
create or replace function public.commit_practice_turn(
  p_user uuid,
  p_session uuid,
  p_seller_seq int,
  p_reply text,
  p_meta jsonb,
  p_meta_status public.turn_meta_status,
  p_provider_wait_ms int
)
returns table (
  buyer_seq int,
  state jsonb,
  ended boolean,
  end_reason public.practice_end_reason,
  evaluation_status public.evaluation_status
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session public.practice_sessions;
  v_secrets public.practice_session_secrets;
  v_existing int;
  v_reply text := btrim(coalesce(p_reply, ''));
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_rules record;
  v_delta int;
  v_status public.turn_meta_status := coalesce(p_meta_status, 'valid');
  v_requested text[];
  v_keys text[] := '{}';
  v_hidden text;
  v_hidden_text text;
  v_wait int := greatest(0, coalesce(p_provider_wait_ms, 0));
  v_seq int;
  v_key text;
begin
  perform private.assert_practice_owner(p_user, p_session);
  select * into v_session from public.practice_sessions s where s.id = p_session for update;

  -- Idempotent: the reply to that seller message already exists.
  select m.seq into v_existing from public.practice_messages m
   where m.session_id = v_session.id and m.author = 'buyer' and m.reply_to_seq = p_seller_seq;
  if v_existing is not null then
    return query select v_existing, private.practice_public_state(v_session.id),
                        v_session.status <> 'active', v_session.end_reason, v_session.evaluation_status;
    return;
  end if;

  if v_session.status <> 'active' then
    raise exception 'not_active' using errcode = 'P0010', detail = 'not_active';
  end if;
  if v_session.turn_lock_seq is distinct from p_seller_seq then
    raise exception 'turn_in_progress' using errcode = 'P0010', detail = 'turn_in_progress';
  end if;
  if char_length(v_reply) not between 1 and 700 then
    raise exception 'invalid reply' using errcode = '23514', detail = 'reply';
  end if;

  begin
    v_delta := coalesce((v_meta ->> 'interest_delta')::numeric, 0)::int;
  exception when others then
    v_delta := 0;
    v_status := 'corrected';
  end;
  select * into v_rules from private.apply_turn_rules(
    v_session.interest, v_session.seller_message_count, v_delta,
    coalesce((v_meta ->> 'seller_abusive')::boolean, false),
    coalesce((v_meta ->> 'end')::boolean, false),
    v_meta ->> 'end_reason');
  if v_rules.corrected and v_status = 'valid' then
    v_status := 'corrected';
  end if;

  select * into v_secrets from public.practice_session_secrets sec where sec.session_id = v_session.id;

  -- Revealed keys: only keys of the persona not revealed yet (FR-025).
  if jsonb_typeof(v_meta -> 'revealed') = 'array' then
    select array_agg(distinct x) into v_requested from jsonb_array_elements_text(v_meta -> 'revealed') x;
    foreach v_key in array coalesce(v_requested, '{}') loop
      if exists (select 1 from jsonb_array_elements(v_secrets.revealables) r where r ->> 'key' = v_key)
         and not exists (select 1 from public.practice_session_reveals r
                          where r.session_id = v_session.id and r.kind = 'revealable' and r.item_key = v_key) then
        v_keys := v_keys || v_key;
      elsif v_status = 'valid' then
        v_status := 'corrected';
      end if;
    end loop;
  end if;

  -- Hidden objection: only an existing id not raised yet.
  v_hidden := nullif(v_meta ->> 'hidden_objection_raised', '');
  if v_hidden is not null then
    select h ->> 'text' into v_hidden_text from jsonb_array_elements(v_secrets.hidden_objections) h
     where h ->> 'id' = v_hidden;
    if v_hidden_text is null or exists (
         select 1 from public.practice_session_reveals r
          where r.session_id = v_session.id and r.kind = 'hidden_objection' and r.item_key = v_hidden) then
      v_hidden := null;
      if v_status = 'valid' then v_status := 'corrected'; end if;
    end if;
  end if;

  v_seq := v_session.last_seq + 1;
  insert into public.practice_messages (
    organization_id, user_id, session_id, seq, author, content, reply_to_seq, interest_before,
    interest_after, interest_delta, revealed_keys, hidden_objection_raised, seller_abusive,
    ends_session, meta_status
  ) values (
    v_session.organization_id, v_session.user_id, v_session.id, v_seq, 'buyer', v_reply, p_seller_seq,
    v_session.interest, v_rules.interest_after, v_rules.interest_delta, v_keys, v_hidden,
    coalesce((v_meta ->> 'seller_abusive')::boolean, false), v_rules.end_reason is not null, v_status
  );

  insert into public.practice_session_reveals (organization_id, user_id, session_id, kind, item_key, value, message_seq)
  select v_session.organization_id, v_session.user_id, v_session.id, 'revealable', r ->> 'key', left(r ->> 'value', 300), v_seq
    from jsonb_array_elements(v_secrets.revealables) r
   where r ->> 'key' = any (v_keys);
  if v_hidden is not null then
    insert into public.practice_session_reveals (organization_id, user_id, session_id, kind, item_key, value, message_seq)
    values (v_session.organization_id, v_session.user_id, v_session.id, 'hidden_objection', v_hidden, left(v_hidden_text, 300), v_seq);
  end if;

  update public.practice_sessions s
     set interest = v_rules.interest_after,
         last_interest_delta = v_rules.interest_delta,
         last_seq = v_seq,
         turn_lock_seq = null,
         turn_lock_expires_at = null,
         provider_wait_ms = s.provider_wait_ms + v_wait,
         deadline_at = s.deadline_at + make_interval(secs => v_wait / 1000.0)
   where s.id = v_session.id;

  if v_rules.end_reason is not null then
    update public.practice_sessions s
       set status = 'finalized',
           end_reason = v_rules.end_reason,
           ended_at = now(),
           evaluation_status = 'pending',
           evaluation_due_at = now() + interval '3 minutes'
     where s.id = v_session.id;
  end if;

  return query
    select v_seq, private.practice_public_state(v_session.id), v_rules.end_reason is not null,
           v_rules.end_reason,
           case when v_rules.end_reason is not null then 'pending'::public.evaluation_status end;
end;
$$;

-- release_practice_turn (service_role) ----------------------------------------------------------------
create or replace function public.release_practice_turn(
  p_user uuid,
  p_session uuid,
  p_seller_seq int,
  p_provider_wait_ms int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wait int := greatest(0, coalesce(p_provider_wait_ms, 0));
begin
  perform private.assert_practice_owner(p_user, p_session);
  update public.practice_sessions s
     set turn_lock_seq = case when s.turn_lock_seq = p_seller_seq then null else s.turn_lock_seq end,
         turn_lock_expires_at = case when s.turn_lock_seq = p_seller_seq then null else s.turn_lock_expires_at end,
         provider_wait_ms = s.provider_wait_ms + v_wait,
         deadline_at = s.deadline_at + make_interval(secs => v_wait / 1000.0)
   where s.id = p_session and s.status = 'active';
end;
$$;

-- finish_practice_session (authenticated) -------------------------------------------------------------
create or replace function public.finish_practice_session(p_session uuid)
returns table (evaluation_status public.evaluation_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session public.practice_sessions;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_session from public.practice_sessions s
   where s.id = p_session and s.user_id = v_uid for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_session.organization_id);

  if v_session.status in ('finalized', 'evaluated') then
    return query select v_session.evaluation_status;
    return;
  end if;
  if v_session.status <> 'active' then
    raise exception 'not_active' using errcode = 'P0010', detail = 'not_active';
  end if;
  if v_session.turn_lock_seq is not null and v_session.turn_lock_expires_at > now() then
    raise exception 'turn_in_progress' using errcode = 'P0010', detail = 'turn_in_progress';
  end if;
  if v_session.seller_message_count = 0 then
    raise exception 'no_seller_messages' using errcode = 'P0010', detail = 'no_seller_messages';
  end if;

  update public.practice_sessions s
     set status = 'finalized',
         end_reason = 'seller_ended',
         ended_at = now(),
         turn_lock_seq = null,
         turn_lock_expires_at = null,
         evaluation_status = 'pending',
         evaluation_due_at = now() + interval '3 minutes'
   where s.id = v_session.id;
  return query select 'pending'::public.evaluation_status;
end;
$$;

-- request_practice_hint (authenticated) ---------------------------------------------------------------
create or replace function public.request_practice_hint(p_session uuid)
returns table (hints_used int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session public.practice_sessions;
begin
  if v_uid is null or not private.current_session_ok() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_session from public.practice_sessions s
   where s.id = p_session and s.user_id = v_uid for update;
  if v_session.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  perform private.assert_seller_org(v_session.organization_id);
  if v_session.status <> 'active' then
    raise exception 'not_active' using errcode = 'P0010', detail = 'not_active';
  end if;
  if not v_session.hints_enabled then
    raise exception 'hints_disabled' using errcode = 'P0010', detail = 'hints_disabled';
  end if;
  if v_session.last_hint_at_seller_count is not distinct from v_session.seller_message_count then
    raise exception 'hint_already_used' using errcode = 'P0010', detail = 'hint_already_used';
  end if;
  update public.practice_sessions s
     set hints_used = s.hints_used + 1, last_hint_at_seller_count = s.seller_message_count
   where s.id = v_session.id;
  return query select v_session.hints_used + 1;
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------
revoke all on function private.apply_turn_rules(int, int, int, boolean, boolean, text) from public;
revoke all on function private.assert_practice_owner(uuid, uuid) from public;
revoke all on function private.practice_public_state(uuid) from public;
revoke all on function private.close_practice_by_time(uuid) from public;

revoke all on function public.begin_practice_turn(uuid, uuid, text) from public, anon;
revoke all on function public.finish_practice_session(uuid) from public, anon;
revoke all on function public.request_practice_hint(uuid) from public, anon;
revoke all on function public.get_practice_turn_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.commit_practice_turn(uuid, uuid, int, text, jsonb, public.turn_meta_status, int)
  from public, anon, authenticated;
revoke all on function public.release_practice_turn(uuid, uuid, int, int) from public, anon, authenticated;

grant execute on function public.begin_practice_turn(uuid, uuid, text) to authenticated;
grant execute on function public.finish_practice_session(uuid) to authenticated;
grant execute on function public.request_practice_hint(uuid) to authenticated;
grant execute on function public.get_practice_turn_context(uuid, uuid) to service_role;
grant execute on function public.commit_practice_turn(uuid, uuid, int, text, jsonb, public.turn_meta_status, int)
  to service_role;
grant execute on function public.release_practice_turn(uuid, uuid, int, int) to service_role;
