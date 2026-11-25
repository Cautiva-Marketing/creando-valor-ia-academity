-- service_role must be able to read and write every public table (admin client, 001 + 002).
begin;
select plan(1);

select is_empty(
  $$ select c.relname::text
       from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')
        and not (has_table_privilege('service_role', c.oid, 'SELECT')
             and has_table_privilege('service_role', c.oid, 'INSERT')
             and has_table_privilege('service_role', c.oid, 'UPDATE')
             and has_table_privilege('service_role', c.oid, 'DELETE')) $$,
  'service_role has SELECT/INSERT/UPDATE/DELETE on every public table'
);

select * from finish();
rollback;
