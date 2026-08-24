-- Productos combo (ej. "Promo Fernet con Coca"): se venden como una sola linea a un precio
-- propio, pero no tienen stock propio -- al venderse descuentan el stock de sus productos
-- componentes reales via el mismo ledger stock_movements que ya usa todo el catalogo.
-- No es una regla de descuento en el checkout: es un producto que "explota" en otros
-- productos al momento de la venta. Un solo nivel (un componente no puede ser a su vez
-- combo, eso se filtra en el formulario, no aca).

alter table public.products add column is_combo boolean not null default false;

create table public.product_components (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  parent_product_id uuid not null references public.products (id) on delete cascade,
  -- restrict: no se puede borrar un producto (hard delete no existe en la app igual, pero
  -- por las dudas) mientras siga siendo componente de algun combo.
  component_product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  check (parent_product_id <> component_product_id),
  unique (parent_product_id, component_product_id)
);

create index product_components_business_id_idx on public.product_components (business_id);
create index product_components_parent_id_idx on public.product_components (parent_product_id);

-- Snapshot de que componentes (y cuanto de cada uno) se descontaron realmente al vender un
-- combo -- mismo motivo que product_name/unit_price son snapshot en sale_items: si despues
-- se edita la receta del combo, una venta vieja (y su eventual cancelacion) no se altera.
create table public.sale_item_components (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  component_product_id uuid not null references public.products (id),
  component_name text not null,
  quantity numeric(12, 3) not null
);

create index sale_item_components_sale_item_id_idx on public.sale_item_components (sale_item_id);
create index sale_item_components_business_id_idx on public.sale_item_components (business_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.product_components enable row level security;
alter table public.sale_item_components enable row level security;

create policy product_components_select on public.product_components
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy product_components_manage on public.product_components
  for all
  using (public.has_permission(business_id, 'can_manage_products'))
  with check (public.has_permission(business_id, 'can_manage_products'));

create policy sale_item_components_select on public.sale_item_components
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin policies de insert/update/delete: solo lo escribe process_sale (security definer),
-- igual que sale_items.

-- ---------------------------------------------------------------------------
-- Guardar la receta de un combo (delete + insert atomico, evita que quede a medio guardar)
-- ---------------------------------------------------------------------------

create function public.save_product_components(
  p_product_id uuid,
  p_business_id uuid,
  p_components jsonb -- [{component_product_id, quantity}]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component jsonb;
begin
  if not public.has_permission(p_business_id, 'can_manage_products') then
    raise exception 'No tiene permiso para gestionar productos';
  end if;

  delete from public.product_components
  where parent_product_id = p_product_id and business_id = p_business_id;

  if p_components is not null then
    for v_component in select * from jsonb_array_elements(p_components)
    loop
      insert into public.product_components (business_id, parent_product_id, component_product_id, quantity)
      values (
        p_business_id, p_product_id,
        (v_component ->> 'component_product_id')::uuid,
        (v_component ->> 'quantity')::numeric
      );
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- process_sale: mismo signature y logica de calculo (subtotal/descuento/impuesto/sales) que
-- supabase/migrations/20260805000739_product_tax.sql -- lo unico que cambia es el segundo
-- loop, donde antes se insertaba un stock_movement contra el producto vendido directo.
-- ---------------------------------------------------------------------------

drop function if exists public.process_sale(uuid, jsonb, uuid, uuid, uuid, numeric);

create function public.process_sale(
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
  v_tax_rate numeric;
  v_item_tax numeric;
  v_sale_item public.sale_items;
  v_component record;
begin
  if not public.is_member(p_business_id) then
    raise exception 'No pertenece a este negocio';
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

    v_item_subtotal := v_product.price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;

    v_tax_rate := 0;
    if v_product.tax_id is not null then
      select rate into v_tax_rate from public.taxes where id = v_product.tax_id;
      v_tax_rate := coalesce(v_tax_rate, 0);
    end if;
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
    cash_received, change_given
  ) values (
    p_business_id, v_sale_number, p_customer_id, auth.uid(),
    p_payment_method_id, p_delivery_type_id, v_subtotal, v_discount, v_tax_amount, v_total,
    p_cash_received, v_change
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_item_subtotal := v_product.price * v_quantity;

    v_tax_rate := 0;
    if v_product.tax_id is not null then
      select rate into v_tax_rate from public.taxes where id = v_product.tax_id;
      v_tax_rate := coalesce(v_tax_rate, 0);
    end if;
    v_item_tax := round(v_item_subtotal * v_tax_rate / (100 + v_tax_rate), 2);

    -- Una sola linea de ticket por combo: la explosion en componentes es invisible para la
    -- venta/recibo, solo afecta que stock_movements se generan.
    insert into public.sale_items (
      sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost, subtotal,
      tax_rate, tax_amount
    ) values (
      v_sale.id, p_business_id, v_product.id, v_product.name, v_quantity, v_product.price, v_product.cost, v_item_subtotal,
      v_tax_rate, v_item_tax
    )
    returning * into v_sale_item;

    if v_product.is_combo then
      -- Descuenta cada componente real, no el combo (que no tiene stock propio). Se vende
      -- aunque un componente quede en negativo -- mismo criterio de "nunca bloquear la
      -- venta por falta de stock" que ya rige el resto del catalogo.
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

-- ---------------------------------------------------------------------------
-- cancel_sale: misma logica de permisos/estado que
-- supabase/migrations/20260728193219_remove_cash_register.sql -- el unico cambio es que,
-- por cada sale_item, si hay filas en sale_item_components se reversa ESE snapshot (no la
-- receta actual del producto, que pudo haber cambiado desde la venta).
-- ---------------------------------------------------------------------------

drop function if exists public.cancel_sale(uuid, text);

create function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
  v_component record;
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
    if exists (select 1 from public.sale_item_components where sale_item_id = v_item.id) then
      for v_component in
        select sic.component_product_id, sic.quantity
        from public.sale_item_components sic
        where sic.sale_item_id = v_item.id
      loop
        if exists (
          select 1 from public.products where id = v_component.component_product_id and track_stock = true
        ) then
          insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
          values (
            v_sale.business_id, v_component.component_product_id, 'cancellation', v_component.quantity,
            'Cancelacion venta #' || v_sale.sale_number, auth.uid()
          );
        end if;
      end loop;
    elsif exists (select 1 from public.products where id = v_item.product_id and track_stock = true) then
      insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
      values (
        v_sale.business_id, v_item.product_id, 'cancellation', v_item.quantity,
        'Cancelacion venta #' || v_sale.sale_number, auth.uid()
      );
    end if;
  end loop;

  update public.sales
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;
