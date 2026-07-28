-- Dashboard: reusa get_top_products, solo le agrega la ganancia por producto para poder
-- armar "mas rentables" / "menor rentabilidad" sin una funcion nueva.

drop function if exists public.get_top_products(uuid, timestamptz, timestamptz, int);

create function public.get_top_products(
  p_business_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_limit int default 10
)
returns table (
  product_name text,
  quantity_sold numeric,
  revenue numeric,
  profit numeric
)
language sql
stable
set search_path = public
as $$
  select
    si.product_name,
    sum(si.quantity) as quantity_sold,
    sum(si.subtotal) as revenue,
    sum((si.unit_price - si.unit_cost) * si.quantity) as profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.business_id = p_business_id
    and s.status = 'completed'
    and s.created_at >= p_date_from
    and s.created_at < p_date_to
  group by si.product_name
  order by revenue desc
  limit p_limit;
$$;
