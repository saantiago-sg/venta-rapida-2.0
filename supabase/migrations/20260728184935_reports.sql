-- Reportes: agregacion del lado del servidor (Fase 7: nunca traer filas crudas al cliente
-- para sumar en JS). Son funciones de solo lectura, sin security definer: corren con los
-- permisos del que llama, asi que la RLS de sales/sale_items ya las protege por si sola.

create function public.get_sales_summary(
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
  select
    coalesce(sum(s.total), 0) as total_sales,
    coalesce(sum(si.item_profit), 0) as total_profit,
    coalesce(sum(s.tax_amount), 0) as total_tax,
    count(distinct s.id) as sale_count
  from public.sales s
  left join (
    select sale_id, sum((unit_price - unit_cost) * quantity) as item_profit
    from public.sale_items
    group by sale_id
  ) si on si.sale_id = s.id
  where s.business_id = p_business_id
    and s.status = 'completed'
    and s.created_at >= p_date_from
    and s.created_at < p_date_to;
$$;

create function public.get_top_products(
  p_business_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_limit int default 10
)
returns table (
  product_name text,
  quantity_sold numeric,
  revenue numeric
)
language sql
stable
set search_path = public
as $$
  select
    si.product_name,
    sum(si.quantity) as quantity_sold,
    sum(si.subtotal) as revenue
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
