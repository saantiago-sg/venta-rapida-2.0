-- process_sale: tolerancia de precio solo para ventas offline.
--
-- El POS manda p_client_reference (idempotencia) tambien en ventas online, asi que la tolerancia
-- del 15% pensada para ventas offline corria en todas: con el catalogo del POS desactualizado y un
-- cambio de precio menor al 15% (ej. 11.500 -> 12.500), la venta online pasaba con el precio viejo.
--
-- Nuevo parametro p_offline:
--   - false (POS online): el precio tiene que coincidir exacto, si no VR001 -- el POS recarga el
--     carrito solo y el cajero ve el total correcto antes de cobrar. El costo se toma siempre de
--     la base (no afecta lo que paga el cliente, solo la ganancia), sin rechazar.
--   - true (cola offline): igual que antes, tolerancia del 15% en precio y costo. La venta ya se
--     cobro y se imprimio el ticket.
--   - Default true: las ventas ya encoladas en algun dispositivo no traen el parametro y tienen que
--     seguir sincronizando como antes. Mandar true a mano no da nada que hoy no se acepte.
--
-- Resto identico a 20261013120000_process_sale_stale_catalog_errors.sql (incluida la rama de combos).

drop function if exists public.process_sale(uuid, jsonb, uuid, uuid, uuid, numeric, uuid);
drop function if exists public.process_sale(uuid, jsonb, uuid, uuid, uuid, numeric, uuid, boolean);

create function public.process_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method_id uuid,
  p_delivery_type_id uuid,
  p_customer_id uuid default null,
  p_cash_received numeric default null,
  p_client_reference uuid default null,
  p_offline boolean default true
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
  v_sale_item public.sale_items;
  v_component record;
  v_missing_name text;
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
      select name into v_missing_name from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      raise exception using
        errcode = 'VR001',
        message = format(
          'El producto "%s" ya no está disponible (se desactivó o se eliminó).',
          coalesce(v_missing_name, v_item ->> 'product_id')
        );
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity <= 0 then
      raise exception 'Cantidad invalida para %', v_product.name;
    end if;

    if p_client_reference is not null and v_item ? 'unit_price' then
      v_item_price := (v_item ->> 'unit_price')::numeric;
      v_item_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.cost);
      v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);

      if not p_offline then
        -- Online: el precio tiene que ser exactamente el actual (el POS recarga el carrito al
        -- recibir VR001) y el costo siempre es el de la base -- no cambia lo que paga el cliente.
        if v_item_price <> v_product.price then
          raise exception using errcode = 'VR001', message = format('El precio de "%s" cambió desde que se cargó la venta.', v_product.name);
        end if;
        v_item_cost := v_product.cost;
      elsif v_product.price = 0 then
        if v_item_price <> 0 then
          raise exception using errcode = 'VR001', message = format('El precio de "%s" cambió desde que se cargó la venta.', v_product.name);
        end if;
      elsif abs(v_item_price - v_product.price) / v_product.price * 100 > v_price_tolerance_pct then
        raise exception using errcode = 'VR001', message = format('El precio de "%s" cambió desde que se cargó la venta.', v_product.name);
      end if;

      if not p_offline then
        null;
      elsif v_product.cost = 0 then
        if v_item_cost <> 0 then
          raise exception using errcode = 'VR001', message = format('El costo de "%s" cambió desde que se cargó la venta.', v_product.name);
        end if;
      elsif abs(v_item_cost - v_product.cost) / v_product.cost * 100 > v_price_tolerance_pct then
        raise exception using errcode = 'VR001', message = format('El costo de "%s" cambió desde que se cargó la venta.', v_product.name);
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
      v_item_cost := case when p_offline then coalesce((v_item ->> 'unit_cost')::numeric, v_product.cost) else v_product.cost end;
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
    )
    returning * into v_sale_item;

    if v_product.is_combo then
      -- Descuenta cada componente real, no el combo (que no tiene stock propio). Se vende
      -- aunque un componente quede en negativo -- mismo criterio de "nunca bloquear la venta
      -- por falta de stock" que ya rige el resto del catalogo.
      for v_component in
        select pc.component_product_id, pc.quantity, p.name as component_name, p.track_stock
        from public.product_components pc
        join public.products p on p.id = pc.component_product_id
        where pc.parent_product_id = v_product.id
      loop
        insert into public.sale_item_components (
          sale_item_id, business_id, component_product_id, component_name, quantity
        ) values (
          v_sale_item.id, p_business_id, v_component.component_product_id, v_component.component_name,
          v_component.quantity * v_quantity
        );

        if v_component.track_stock then
          insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
          values (
            p_business_id, v_component.component_product_id, 'sale', -(v_component.quantity * v_quantity),
            'Venta #' || v_sale.sale_number || ' (combo: ' || v_product.name || ')', auth.uid()
          );
        end if;
      end loop;
    elsif v_product.track_stock then
      insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
      values (p_business_id, v_product.id, 'sale', -v_quantity, 'Venta #' || v_sale.sale_number, auth.uid());
    end if;
  end loop;

  return v_sale;
end;
$$;
