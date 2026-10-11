-- Historial de ventas: las cards (vendido, ganancia, margen, impuestos, pedidos) salen de
-- get_sales_summary, que solo filtraba por fecha -- al filtrar la tabla por medio de pago o N° de
-- pedido, la tabla mostraba esas ventas pero las cards seguian sumando todo el rango.
--
-- Se agregan los mismos filtros que aplica la tabla (ver SalesHistoryRepository.list), opcionales:
-- con null calcula exactamente lo mismo que antes, asi que el dashboard (que llama con 3
-- parametros) no cambia.
--
-- drop + create en vez de create or replace: cambiar la lista de parametros crea un overload, y
-- con la version de 3 parametros conviviendo con la de 5 (con defaults) una llamada con 3
-- seria ambigua.

drop function public.get_sales_summary(uuid, timestamptz, timestamptz);

create function public.get_sales_summary(
  p_business_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_payment_method_id uuid default null,
  p_order_number_query text default null
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
      and (p_payment_method_id is null or s.payment_method_id = p_payment_method_id)
      and (
        coalesce(trim(p_order_number_query), '') = ''
        or s.sale_number::text ilike '%' || trim(p_order_number_query) || '%'
      )
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
