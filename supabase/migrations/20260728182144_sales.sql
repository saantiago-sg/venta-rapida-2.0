-- Ventas: tabla de ventas + detalle + RPC process_sale que hace todo atomico
-- (descuenta stock via el ledger, mueve la caja si es efectivo, numera el ticket).
-- Ver Fase 1/3: la logica de negocio vive en Postgres, nunca en el cliente. El precio de
-- cada item se toma siempre de la base (products.price), nunca del valor que manda el cliente.

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_number bigint not null,
  cash_session_id uuid not null references public.cash_sessions (id),
  customer_id uuid references public.customers (id) on delete set null,
  employee_id uuid not null references public.profiles (id),
  payment_method_id uuid not null references public.payment_methods (id),
  delivery_type_id uuid not null references public.delivery_types (id),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  subtotal numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  cash_received numeric(12, 2),
  change_given numeric(12, 2),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  unique (business_id, sale_number)
);

create index sales_business_id_idx on public.sales (business_id);
create index sales_cash_session_id_idx on public.sales (cash_session_id);
create index sales_customer_id_idx on public.sales (customer_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id),
  -- snapshot: si el precio del producto cambia despues, esta venta no se altera retroactivamente
  product_name text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  unit_cost numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_business_id_idx on public.sale_items (business_id);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy sales_select on public.sales
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy sale_items_select on public.sale_items
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin policies de insert/update/delete: toda escritura pasa por process_sale (y a futuro
-- cancel_sale), nunca por un insert directo del cliente.

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

  -- validar y sumar: el precio de cada item sale de la base, nunca de lo que manda el cliente
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
    insert into public.cash_movements (business_id, cash_session_id, type, amount, description, created_by)
    values (p_business_id, v_cash_session_id, 'sale', v_total, 'Venta #' || v_sale.sale_number, auth.uid());
  end if;

  return v_sale;
end;
$$;
