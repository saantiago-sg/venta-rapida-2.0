-- Toggle por negocio para poder usar cierre de caja o no (Configuracion > Negocio). Con esto
-- en false, el gate de efectivo de process_sale (ver 20260908120000_cash_sessions.sql) queda
-- completamente inerte: cobrar en efectivo nunca exige turno abierto, como si la caja no
-- existiera. Default true -- el negocio que ya la venia probando no pierde el comportamiento
-- actual al aplicar esta migracion.

alter table public.businesses
  add column cash_register_enabled boolean not null default true;

drop function if exists public.process_sale(uuid, jsonb, uuid, uuid, uuid, numeric, uuid);

create function public.process_sale(
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
  v_price_tolerance_pct constant numeric := 15;
  v_sale_number bigint;
  v_is_cash boolean;
  v_cash_discount_pct numeric;
  v_cash_register_enabled boolean;
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

  select cash_discount_percentage, cash_register_enabled
  into v_cash_discount_pct, v_cash_register_enabled
  from public.businesses where id = p_business_id;

  -- Cierre de caja opcional por negocio (Configuracion > Negocio): con el toggle en false esto
  -- nunca se evalua, cobrar en efectivo nunca depende de un turno abierto.
  if v_is_cash and v_cash_register_enabled and not exists (
    select 1 from public.cash_sessions where business_id = p_business_id and status = 'open'
  ) then
    raise exception 'No hay una caja abierta para cobrar en efectivo. Abrí un turno o elegí otro medio de pago.';
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

    if p_client_reference is not null and v_item ? 'unit_price' then
      v_item_price := (v_item ->> 'unit_price')::numeric;
      v_item_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.cost);
      v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);

      if v_product.price = 0 then
        if v_item_price <> 0 then
          raise exception 'El precio de "%" cambió mientras la venta estaba pendiente de sincronizar. Volvé a cargarla con el precio actual.', v_product.name;
        end if;
      elsif abs(v_item_price - v_product.price) / v_product.price * 100 > v_price_tolerance_pct then
        raise exception 'El precio de "%" cambió mientras la venta estaba pendiente de sincronizar. Volvé a cargarla con el precio actual.', v_product.name;
      end if;

      if v_product.cost = 0 then
        if v_item_cost <> 0 then
          raise exception 'El costo de "%" cambió mientras la venta estaba pendiente de sincronizar. Volvé a cargarla con el precio actual.', v_product.name;
        end if;
      elsif abs(v_item_cost - v_product.cost) / v_product.cost * 100 > v_price_tolerance_pct then
        raise exception 'El costo de "%" cambió mientras la venta estaba pendiente de sincronizar. Volvé a cargarla con el precio actual.', v_product.name;
      end if;
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
    v_subtotal := v_subtotal + v_item_subtotal;
    v_tax_amount := v_tax_amount + round(v_item_subtotal * v_tax_rate / (100 + v_tax_rate), 2);
  end loop;

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
