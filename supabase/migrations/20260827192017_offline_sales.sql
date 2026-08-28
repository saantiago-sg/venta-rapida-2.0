-- Venta offline: si se corta el internet del local, la venta se guarda en una cola local
-- (IndexedDB, del lado del cliente) y se reintenta sola cuando vuelve la conexion. Esta
-- migracion agrega lo que hace falta del lado del server para que esa sincronizacion sea
-- segura: idempotencia (no duplicar la venta si el reintento llega despues de que la primera
-- ya se proceso bien pero la respuesta se perdio) y la posibilidad de "congelar" el
-- precio/costo/impuesto que vio el cajero en el momento, en vez de tomar el precio actual del
-- producto al sincronizar (que puede haber cambiado durante el corte).

alter table public.sales add column client_reference uuid unique;

-- Postgres trata un parametro nuevo como una firma distinta, no como un reemplazo -- sin este
-- drop, "create or replace" de mas abajo deja la version vieja (6 parametros, sin
-- client_reference) colgada al lado de la nueva en vez de reemplazarla.
drop function if exists public.process_sale(uuid, jsonb, uuid, uuid, uuid, numeric);

create or replace function public.process_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method_id uuid,
  p_delivery_type_id uuid,
  p_customer_id uuid default null,
  p_cash_received numeric default null,
  p_client_reference uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_number bigint;
  v_is_cash boolean;
  v_cash_discount_pct numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric;
  v_change numeric;
  v_sale public.sales;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric;
  v_item_subtotal numeric;
  v_item_price numeric;
  v_item_cost numeric;
  v_tax_rate numeric;
  v_item_tax numeric;
begin
  if not public.is_member(p_business_id) then
    raise exception 'No pertenece a este negocio';
  end if;

  -- Idempotencia: si esta venta offline ya se proceso antes (la respuesta se perdio por el
  -- corte pero el insert ya habia quedado guardado), se devuelve la existente en vez de
  -- descontar stock una segunda vez.
  if p_client_reference is not null then
    select * into v_sale from public.sales
    where business_id = p_business_id and client_reference = p_client_reference;
    if found then
      return v_sale;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  select is_cash into v_is_cash
  from public.payment_methods
  where id = p_payment_method_id and business_id = p_business_id and active = true;

  if v_is_cash is null then
    raise exception 'Medio de pago invalido';
  end if;

  if not exists (
    select 1 from public.delivery_types
    where id = p_delivery_type_id and business_id = p_business_id and active = true
  ) then
    raise exception 'Tipo de entrega invalido';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id and active = true;

    if v_product is null then
      raise exception 'Producto invalido o inactivo: %', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity <= 0 then
      raise exception 'Cantidad invalida para %', v_product.name;
    end if;

    -- Venta offline (p_client_reference not null) y el item trae el precio que vio el cajero:
    -- se usa ese, congelado, en vez de recalcular con el precio actual del producto. El
    -- camino online de siempre (sin client_reference) nunca confia en un precio del cliente.
    if p_client_reference is not null and v_item ? 'unit_price' then
      v_item_price := (v_item ->> 'unit_price')::numeric;
      v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    else
      v_item_price := v_product.price;
      v_tax_rate := 0;
      if v_product.tax_id is not null then
        select rate into v_tax_rate from public.taxes where id = v_product.tax_id;
        v_tax_rate := coalesce(v_tax_rate, 0);
      end if;
    end if;

    v_item_subtotal := v_item_price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
    v_tax_amount := v_tax_amount + round(v_item_subtotal * v_tax_rate / (100 + v_tax_rate), 2);
  end loop;

  select cash_discount_percentage into v_cash_discount_pct
  from public.businesses where id = p_business_id;

  if v_is_cash and v_cash_discount_pct > 0 then
    v_discount := round(v_subtotal * v_cash_discount_pct / 100, 2);
  end if;

  v_total := v_subtotal - v_discount;
  v_change := case when p_cash_received is not null then p_cash_received - v_total else null end;

  update public.businesses
  set next_sale_number = next_sale_number + 1
  where id = p_business_id
  returning next_sale_number - 1 into v_sale_number;

  insert into public.sales (
    business_id, sale_number, customer_id, employee_id,
    payment_method_id, delivery_type_id, subtotal, discount_amount, tax_amount, total,
    cash_received, change_given, client_reference
  ) values (
    p_business_id, v_sale_number, p_customer_id, auth.uid(),
    p_payment_method_id, p_delivery_type_id, v_subtotal, v_discount, v_tax_amount, v_total,
    p_cash_received, v_change, p_client_reference
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;

    if p_client_reference is not null and v_item ? 'unit_price' then
      v_item_price := (v_item ->> 'unit_price')::numeric;
      v_item_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.cost);
      v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    else
      v_item_price := v_product.price;
      v_item_cost := v_product.cost;
      v_tax_rate := 0;
      if v_product.tax_id is not null then
        select rate into v_tax_rate from public.taxes where id = v_product.tax_id;
        v_tax_rate := coalesce(v_tax_rate, 0);
      end if;
    end if;

    v_item_subtotal := v_item_price * v_quantity;
    v_item_tax := round(v_item_subtotal * v_tax_rate / (100 + v_tax_rate), 2);

    insert into public.sale_items (
      sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost, subtotal,
      tax_rate, tax_amount
    ) values (
      v_sale.id, p_business_id, v_product.id, v_product.name, v_quantity, v_item_price, v_item_cost, v_item_subtotal,
      v_tax_rate, v_item_tax
    );

    if v_product.track_stock then
      insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
      values (p_business_id, v_product.id, 'sale', -v_quantity, 'Venta #' || v_sale.sale_number, auth.uid());
    end if;
  end loop;

  return v_sale;
end;
$$;
