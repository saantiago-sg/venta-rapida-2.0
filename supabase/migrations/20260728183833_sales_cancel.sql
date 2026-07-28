-- Cancelacion de ventas (Fase 4: gated por el permiso can_cancel_sales).
-- Agrega cash_movements.sale_id para poder revertir el movimiento de caja de una venta
-- puntual sin depender de matchear por texto de descripcion.

alter table public.cash_movements add column sale_id uuid references public.sales (id) on delete set null;

create or replace function public.process_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method_id uuid,
  p_delivery_type_id uuid,
  p_customer_id uuid default null,
  p_cash_received numeric default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash_session_id uuid;
  v_sale_number bigint;
  v_is_cash boolean;
  v_cash_discount_pct numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_change numeric;
  v_sale public.sales;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric;
  v_item_subtotal numeric;
begin
  if not public.is_member(p_business_id) then
    raise exception 'No pertenece a este negocio';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  select id into v_cash_session_id
  from public.cash_sessions
  where business_id = p_business_id and status = 'open'
  limit 1;

  if v_cash_session_id is null then
    raise exception 'No hay una caja abierta';
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

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
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
    business_id, sale_number, cash_session_id, customer_id, employee_id,
    payment_method_id, delivery_type_id, subtotal, discount_amount, total,
    cash_received, change_given
  ) values (
    p_business_id, v_sale_number, v_cash_session_id, p_customer_id, auth.uid(),
    p_payment_method_id, p_delivery_type_id, v_subtotal, v_discount, v_total,
    p_cash_received, v_change
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_item_subtotal := v_product.price * v_quantity;

    insert into public.sale_items (
      sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost, subtotal
    ) values (
      v_sale.id, p_business_id, v_product.id, v_product.name, v_quantity, v_product.price, v_product.cost, v_item_subtotal
    );

    if v_product.track_stock then
      insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
      values (p_business_id, v_product.id, 'sale', -v_quantity, 'Venta #' || v_sale.sale_number, auth.uid());
    end if;
  end loop;

  if v_is_cash then
    insert into public.cash_movements (business_id, cash_session_id, type, amount, description, created_by, sale_id)
    values (p_business_id, v_cash_session_id, 'sale', v_total, 'Venta #' || v_sale.sale_number, auth.uid(), v_sale.id);
  end if;

  return v_sale;
end;
$$;

create function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;

  if v_sale is null then
    raise exception 'Venta no encontrada';
  end if;

  if not public.has_permission(v_sale.business_id, 'can_cancel_sales') then
    raise exception 'No tiene permiso para cancelar ventas';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'La venta ya esta cancelada';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id
  loop
    if exists (select 1 from public.products where id = v_item.product_id and track_stock = true) then
      insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
      values (
        v_sale.business_id, v_item.product_id, 'cancellation', v_item.quantity,
        'Cancelacion venta #' || v_sale.sale_number, auth.uid()
      );
    end if;
  end loop;

  -- revertir el movimiento de caja solo si la sesion en la que se vendio sigue abierta
  if exists (select 1 from public.cash_sessions where id = v_sale.cash_session_id and status = 'open') then
    insert into public.cash_movements (business_id, cash_session_id, type, amount, description, created_by, sale_id)
    select v_sale.business_id, v_sale.cash_session_id, 'withdrawal', -cm.amount,
           'Cancelacion venta #' || v_sale.sale_number, auth.uid(), v_sale.id
    from public.cash_movements cm
    where cm.sale_id = v_sale.id and cm.type = 'sale';
  end if;

  update public.sales
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;
