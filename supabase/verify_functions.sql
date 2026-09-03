-- Chequeo MANUAL de drift entre la base real y el repo (no es un pipeline, no corre solo).
--
-- Uso: supabase db query --linked --file supabase/verify_functions.sql > /tmp/live_functions.sql
-- y despues comparar (a ojo o con `diff`) cada bloque contra el "create function ... as $$ ...
-- $$;" de la migracion que se indica como fuente actual en el comentario de arriba de cada
-- select. Si no coinciden letra por letra, alguien toco la base por fuera del repo (ej.
-- pegando SQL a mano en el Dashboard) y hay que reconciliar: o se actualiza la migracion para
-- que refleje lo que quedo realmente aplicado, o se vuelve a aplicar la migracion para que la
-- base refleje el repo (ver incidentes de 2026-09-02: ticket_settings_backfill y
-- process_sale_price_tolerance, los dos por copiar/pegar a mano en el SQL Editor).
--
-- No es exhaustivo a proposito -- prioriza lo que toca dinero/permisos/aislamiento
-- multi-tenant, que es donde un drift silencioso sale mas caro. Sumar mas funciones a esta
-- lista a medida que se identifiquen como criticas.

-- fuente actual: supabase/migrations/20260902210000_process_sale_price_tolerance.sql
select pg_get_functiondef('public.process_sale(uuid, jsonb, uuid, uuid, uuid, numeric, uuid)'::regprocedure);

-- fuente actual: supabase/migrations/20260818190000_electronic_invoicing.sql
select pg_get_functiondef('public.cancel_sale(uuid, text)'::regprocedure);

-- fuente actual: supabase/migrations/20260726225427_identity_tenancy.sql
select pg_get_functiondef('public.is_member(uuid)'::regprocedure);
select pg_get_functiondef('public.has_permission(uuid, text)'::regprocedure);
select pg_get_functiondef('public.is_super_admin()'::regprocedure);
