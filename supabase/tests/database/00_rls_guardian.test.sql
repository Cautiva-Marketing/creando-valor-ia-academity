-- T022 — RLS guardian (Constitution I). Fails if a new table skips RLS or a business table lacks an
-- indexed, NOT NULL organization_id with FK. Platform tables are listed explicitly (data-model.md →
-- "Clasificación de tablas").
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is_empty(
  $$
    select n.nspname || '.' || c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private')
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
  $$,
  'every table in public and private has RLS enabled'
);

create temporary view business_tables as
  select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relname not in (
       'organizations', 'profiles', 'platform_admins', 'legal_documents', 'legal_acceptances',
       'invitations', 'access_requests', 'audit_logs'
     );

select is_empty(
  $$
    select relname from business_tables b
     where not exists (
       select 1 from pg_attribute a
        where a.attrelid = b.oid and a.attname = 'organization_id' and a.attnotnull and not a.attisdropped
     )
  $$,
  'every business table has organization_id NOT NULL'
);

select is_empty(
  $$
    select relname from business_tables b
     where not exists (
       select 1
         from pg_constraint k
         join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
        where k.conrelid = b.oid
          and k.contype = 'f'
          and k.confrelid = 'public.organizations'::regclass
          and a.attname = 'organization_id'
     )
  $$,
  'every business table has a FK organization_id → organizations'
);

select is_empty(
  $$
    select relname from business_tables b
     where not exists (
       select 1
         from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = b.oid and a.attname = 'organization_id'
     )
  $$,
  'every business table has an index whose first column is organization_id'
);

select is_empty(
  $$
    select table_schema || '.' || table_name || ':' || privilege_type
      from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema in ('public', 'private')
       and not (table_schema = 'public' and table_name = 'legal_documents' and privilege_type = 'SELECT')
  $$,
  'anon has no table privileges except SELECT on legal_documents'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'anon cannot execute any function in public or private'
);

select * from finish();
rollback;
