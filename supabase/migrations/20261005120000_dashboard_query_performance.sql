-- Dashboard lento al cargar. Dos causas, las dos del lado de la base:
--
-- 1) get_sales_summary seguia recorriendo TODO el historial de sale_items del negocio. El fix
--    anterior (20260924200000_fix_sales_summary_scan.sql) le sumo el filtro por business_id al
--    subquery de ganancia, pero ese subquery sigue sin filtro de fecha: para mostrar las ventas
--    de HOY agregaba cada item vendido desde que el negocio existe, y recien despues el join
--    descartaba todo lo que no fuera del dia. Ademas, la RLS de sale_items llama a
--    is_member(business_id) por cada fila leida (security definer, Postgres no la puede
--    inlinear), asi que el costo crecia con la antiguedad del negocio aunque el dia tuviera
--    pocas ventas.
--
--    El fix: filtrar primero las ventas del rango (usa sales_business_id_created_at_idx) y
--    llegar a sus items por sale_id (sale_items_sale_id_idx). Solo se leen los items de las
--    ventas del rango. Mismo resultado: cada venta aporta su total/iva una sola vez y la
--    ganancia es la suma de sus items, igual que antes.
--
-- 2) Los avisos de vencimiento del dashboard (ver ProductRepository.countExpirationAlerts)
--    cuentan productos activos con expiration_date en un rango. Sin indice, cada conteo
--    recorria todo el catalogo del negocio (con la RLS por fila). Indice parcial: solo
--    incluye productos que tienen fecha de vencimiento, que suelen ser una minoria.

create or replace function public.get_sales_summary(
  p_business_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz
)
returns table (
  total_sales numeric,
  total_profit numeric,
  total_tax numeric,
  sale_count bigint
)
language sql
stable
set search_path = public
as $$
  with range_sales as (
    select s.id, s.total, s.tax_amount
    from public.sales s
    where s.business_id = p_business_id
      and s.status = 'completed'
      and s.created_at >= p_date_from
      and s.created_at < p_date_to
  )
  select
    coalesce((select sum(total) from range_sales), 0) as total_sales,
    coalesce((
      select sum((si.unit_price - si.unit_cost) * si.quantity)
      from public.sale_items si
      join range_sales rs on rs.id = si.sale_id
    ), 0) as total_profit,
    coalesce((select sum(tax_amount) from range_sales), 0) as total_tax,
    (select count(*) from range_sales) as sale_count;
$$;

create index products_business_expiration_idx
  on public.products (business_id, expiration_date)
  where expiration_date is not null;
