-- get_sales_summary calculaba la ganancia con un subquery que agregaba TODA la tabla
-- sale_items (de TODOS los negocios de la plataforma), sin ningun filtro por business_id ni
-- fecha, y recien despues cruzaba ese resultado con las ventas del negocio pedido:
--
--   left join (
--     select sale_id, sum((unit_price - unit_cost) * quantity) as item_profit
--     from public.sale_items
--     group by sale_id
--   ) si on si.sale_id = s.id
--
-- Un group by sin where no deja que Postgres empuje el filtro de business_id/fecha para
-- adentro del subquery, asi que cada llamado recorre TODOS los sale_items de TODOS los
-- negocios para armar el agregado, y descarta casi todo despues del join. Esta funcion la
-- llaman tanto el Dashboard como Historial de ventas (ver ReportsRepository.getSummary) en
-- cada carga de pantalla y cada cambio de filtro -- con la plataforma creciendo, se iba
-- poniendo mas lenta para todos los negocios por igual, no solo para el que tiene mucho
-- historial.
--
-- El fix: agregar el where business_id = p_business_id adentro del subquery (sale_items ya
-- tiene ese indice, ver sale_items_business_id_idx en 20260728182144_sales.sql). El join
-- contra s (ya filtrada por fecha/estado) sigue descartando lo que no matchee, asi que el
-- resultado es identico -- solo cambia cuanto tiene que recorrer para llegar a el.

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
  select
    coalesce(sum(s.total), 0) as total_sales,
    coalesce(sum(si.item_profit), 0) as total_profit,
    coalesce(sum(s.tax_amount), 0) as total_tax,
    count(distinct s.id) as sale_count
  from public.sales s
  left join (
    select sale_id, sum((unit_price - unit_cost) * quantity) as item_profit
    from public.sale_items
    where business_id = p_business_id
    group by sale_id
  ) si on si.sale_id = s.id
  where s.business_id = p_business_id
    and s.status = 'completed'
    and s.created_at >= p_date_from
    and s.created_at < p_date_to;
$$;
