-- T027 — rate limiting functions (research.md §R9)
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- 4 failures inside the window → still allowed (max 5)
insert into private.rate_limit_events (scope, key_hash)
select 'login_account', '\x01'::bytea from generate_series(1, 4);
select is(
  (select allowed from private.check_rate_limit('login_account', '\x01', 5, interval '15 minutes', interval '15 minutes')),
  true,
  'allows attempts up to the maximum'
);

-- 5th failure → blocked with ~15 minutes of retry (lockout from the last failure)
select private.record_rate_limit_event('login_account', '\x01');
select is(
  (select allowed from private.check_rate_limit('login_account', '\x01', 5, interval '15 minutes', interval '15 minutes')),
  false,
  'blocks once the maximum is reached'
);
select is(
  (select retry_after_seconds from private.check_rate_limit('login_account', '\x01', 5, interval '15 minutes', interval '15 minutes')),
  900,
  'retry_after is the lockout counted from the last failure'
);

-- Events outside the window are ignored
insert into private.rate_limit_events (scope, key_hash, occurred_at)
select 'login_account', '\x02'::bytea, now() - interval '20 minutes' from generate_series(1, 10);
select is(
  (select allowed from private.check_rate_limit('login_account', '\x02', 5, interval '15 minutes', interval '15 minutes')),
  true,
  'events older than the window are ignored'
);

-- Window-based scopes: retry when the window drops below the maximum
insert into private.rate_limit_events (scope, key_hash, occurred_at) values
  ('recovery_email', '\x03', now() - interval '50 minutes'),
  ('recovery_email', '\x03', now() - interval '40 minutes'),
  ('recovery_email', '\x03', now() - interval '30 minutes');
select is(
  (select retry_after_seconds from private.check_rate_limit('recovery_email', '\x03', 3, interval '1 hour')),
  600,
  'window-based limit retries when the oldest counted event leaves the window'
);

-- Keys and scopes are independent
select is(
  (select allowed from private.check_rate_limit('login_ip', '\x01', 5, interval '15 minutes', interval '15 minutes')),
  true,
  'scopes are independent'
);

-- No EXECUTE for the API roles
select ok(
  not has_function_privilege('authenticated', 'public.check_rate_limit(text, bytea, integer, interval, interval)', 'execute')
  and not has_function_privilege('anon', 'public.check_rate_limit(text, bytea, integer, interval, interval)', 'execute')
  and has_function_privilege('service_role', 'public.check_rate_limit(text, bytea, integer, interval, interval)', 'execute'),
  'check_rate_limit is executable only by service_role'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_rate_limit_event(text, bytea)', 'execute')
  and not has_function_privilege('anon', 'public.record_rate_limit_event(text, bytea)', 'execute'),
  'record_rate_limit_event is not executable by anon or authenticated'
);

select * from finish();
rollback;
