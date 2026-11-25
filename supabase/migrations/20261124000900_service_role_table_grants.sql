-- Explicit table privileges for service_role (the server-side admin client).
--
-- 001 and the 002 tables above relied on the default privileges that a local `supabase start`
-- sets up. The production project does not have them (service_role got "permission denied for
-- table profiles"), so every public table is granted explicitly here and future tables inherit
-- the same grant. RLS stays enabled; service_role bypasses it by design and is only used on the
-- server (src/lib/supabase/admin.ts). anon/authenticated grants are untouched.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
