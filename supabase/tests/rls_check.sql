-- Guardrail (Fase 7): falla si alguna tabla de public. quedo sin RLS habilitado.
-- Correr despues de cada migracion nueva: psql "$DB_URL" -f supabase/tests/rls_check.sql
-- (o "supabase db execute --file supabase/tests/rls_check.sql" contra el proyecto linkeado)

do $$
declare
  v_offender record;
  v_count int := 0;
begin
  for v_offender in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('schema_migrations')
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = v_offender.schemaname
        and c.relname = v_offender.tablename
        and c.relrowsecurity = true
    ) then
      raise warning 'Tabla sin RLS habilitado: %.%', v_offender.schemaname, v_offender.tablename;
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count > 0 then
    raise exception '% tabla(s) de public. sin RLS habilitado -- ver warnings arriba', v_count;
  else
    raise notice 'OK: todas las tablas de public. tienen RLS habilitado.';
  end if;
end;
$$;
