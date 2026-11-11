do $$
declare
  table_name text;
  table_oid regclass;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['movimiento', 'transferencia', 'cuenta', 'moneda']
    loop
      table_oid := to_regclass(format('public.%I', table_name));
      if table_oid is not null and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;
