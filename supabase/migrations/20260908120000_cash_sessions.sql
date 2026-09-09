-- Cierre de caja v2: reconstruido despues de sacar la version anterior por demasiado compleja
-- (ver supabase/migrations/20260728193219_remove_cash_register.sql y el diagnostico guardado
-- en memoria del proyecto). Tres cambios deliberados de diseno respecto de esa v1:
--
-- a) La caja controla UNICAMENTE el efectivo. process_sale (mas abajo) solo exige turno
--    abierto cuando el medio de pago es efectivo -- cualquier otro medio se cobra siempre,
--    haya o no una caja abierta. La v1 bloqueaba TODA venta por esto.
-- b) Sin movimientos manuales ni tabla de ledger (cash_movements no existe en esta version).
--    El "esperado" se calcula on-demand sumando public.sales directo (ver close_cash_session),
--    no se acumula escritura por escritura.
-- c) sales NO tiene cash_session_id (a proposito, sin FK): que venta pertenece a que turno se
--    resuelve por rango de fechas (opened_at/closed_at), ya que nunca hay dos turnos
--    simultaneos para el mismo negocio (mismo indice unico parcial que ya tenia la v1). Esto
--    logra dos cosas: process_sale/cancel_sale no necesitan saber que existen turnos (cero
--    acoplamiento nuevo), y una venta cancelada DESPUES de que su turno ya cerro no toca ese
--    cierre historico -- queda marcada (has_late_cancellation en list_cash_sessions, calculado
--    al leer, no guardado) para que el dueno la note en vez de que desaparezca en silencio.
-- d) Una sola caja por negocio: ni siquiera existe una entidad "cash_registers" (la v1 modelaba
--    multiples cajas sin ningun caso de uso real).

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  opened_by uuid references public.profiles (id),
  opened_at timestamptz not null default now(),
  opening_amount numeric(12, 2) not null check (opening_amount >= 0),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  expected_amount numeric(12, 2),
  closing_amount numeric(12, 2),
  difference numeric(12, 2),
  status text not null default 'open' check (status in ('open', 'closed'))
);

create index cash_sessions_business_id_idx on public.cash_sessions (business_id);

-- Un solo turno abierto por negocio a la vez (sin multi-cajero, igual que la v1 en ese punto
-- puntual -- si dos cajeros comparten turno, comparten la misma caja).
create unique index cash_sessions_one_open_per_business
  on public.cash_sessions (business_id) where status = 'open';

alter table public.cash_sessions enable row level security;

create policy cash_sessions_select on public.cash_sessions
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin policy de insert/update: abrir/cerrar solo via las funciones de abajo (security definer),
-- mismo criterio que ya se usaba en la v1 para evitar dos aperturas simultaneas.

create function public.open_cash_session(p_business_id uuid, p_opening_amount numeric)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions;
begin
  if not public.has_permission(p_business_id, 'can_manage_cash_movements') then
    raise exception 'No tiene permiso para abrir la caja';
  end if;

  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'El monto inicial no puede ser negativo';
  end if;

  if exists (
    select 1 from public.cash_sessions where business_id = p_business_id and status = 'open'
  ) then
    raise exception 'Ya hay una caja abierta';
  end if;

  insert into public.cash_sessions (business_id, opened_by, opening_amount, status)
  values (p_business_id, auth.uid(), p_opening_amount, 'open')
  returning * into v_session;

  return v_session;
end;
$$;

-- El esperado se calcula en el momento del cierre, nunca antes: apertura + ventas en efectivo
-- completadas dentro de la ventana [opened_at, now()). "total" de una venta en efectivo ya es
-- cash_received - change_given, asi que "ventas en efectivo - vueltos" sale solo sumando total,
-- sin trackear vueltos aparte. Filtrar status = 'completed' hace que una venta cancelada
-- MIENTRAS el turno seguia abierto se descuente sola de la cuenta, sin necesidad de ningun
-- movimiento de reverso (asi se evita el problema b de la v1).
create function public.close_cash_session(p_session_id uuid, p_closing_amount numeric)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions;
  v_expected numeric;
begin
  select * into v_session from public.cash_sessions where id = p_session_id for update;

  if v_session is null then
    raise exception 'Turno no encontrado';
  end if;

  if not public.has_permission(v_session.business_id, 'can_manage_cash_movements') then
    raise exception 'No tiene permiso para cerrar la caja';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Este turno ya esta cerrado';
  end if;

  if p_closing_amount is null or p_closing_amount < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  select v_session.opening_amount + coalesce(sum(s.total), 0)
  into v_expected
  from public.sales s
  join public.payment_methods pm on pm.id = s.payment_method_id
  where s.business_id = v_session.business_id
    and pm.is_cash
    and s.status = 'completed'
    and s.created_at >= v_session.opened_at
    and s.created_at < now();

  update public.cash_sessions
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      closing_amount = p_closing_amount,
      expected_amount = v_expected,
      difference = p_closing_amount - v_expected
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- Historial de turnos + el indicador del problema c de la v1: has_late_cancellation es
-- exists(...), nunca una columna guardada -- una venta en efectivo de ESTE turno (por rango de
-- fechas) que se cancelo DESPUES de que closed_at ya paso. No compara contra "una cancelacion
-- reciente" en general, compara contra el cierre de este turno puntual.
--
-- security definer + chequeo de permiso adentro (no security invoker): mostrar quien
-- abrio/cerro requiere leer profiles de otros miembros, y esa tabla tiene RLS gateada por
-- can_manage_employees (ver 20260731155554_employees.sql) -- un cajero comun sin ese permiso
-- igual necesita ver el nombre de quien abrio el turno en este historial puntual.
create function public.list_cash_sessions(p_business_id uuid)
returns table (
  id uuid,
  opened_at timestamptz,
  opening_amount numeric,
  opened_by_name text,
  closed_at timestamptz,
  closing_amount numeric,
  expected_amount numeric,
  difference numeric,
  closed_by_name text,
  status text,
  has_late_cancellation boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(p_business_id, 'can_manage_cash_movements') then
    raise exception 'No tiene permiso para ver el historial de caja';
  end if;

  return query
  select
    cs.id,
    cs.opened_at,
    cs.opening_amount,
    coalesce(po.full_name, po.email, 'Empleado') as opened_by_name,
    cs.closed_at,
    cs.closing_amount,
    cs.expected_amount,
    cs.difference,
    coalesce(pc.full_name, pc.email) as closed_by_name,
    cs.status,
    exists (
      select 1
      from public.sales s
      join public.payment_methods pm on pm.id = s.payment_method_id
      where s.business_id = cs.business_id
        and pm.is_cash
        and s.status = 'cancelled'
        and s.created_at >= cs.opened_at
        and s.created_at < cs.closed_at
        and s.cancelled_at > cs.closed_at
    ) as has_late_cancellation
  from public.cash_sessions cs
  left join public.profiles po on po.id = cs.opened_by
  left join public.profiles pc on pc.id = cs.closed_by
  where cs.business_id = p_business_id
  order by cs.opened_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- process_sale: un unico agregado nuevo (problema a de la v1) -- si el medio es efectivo y no
-- hay turno abierto, rechaza; si no es efectivo, ni se evalua. Resto de la funcion identico a
-- 20260902210000_process_sale_price_tolerance.sql (la regresion de combos de esa version queda
-- fuera de este cambio a proposito, se encara aparte).
-- ---------------------------------------------------------------------------

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

  -- Unico agregado nuevo de esta migracion: la caja controla solo el efectivo (problema a).
  if v_is_cash and not exists (
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

-- ---------------------------------------------------------------------------
-- Permiso 'can_manage_cash_movements': no existia en ningun lado activo (solo en la migracion
-- vieja ya borrada) -- se define aca por primera vez. Habilitado por default para cajero, a
-- diferencia del resto del catalogo (Fase 4): abrir/cerrar caja es una tarea operativa diaria,
-- no una accion sensible como cancelar ventas. Backfill para memberships de cajero que ya
-- existian antes de este cambio, asi el default aplica retroactivamente y no solo a
-- invitaciones nuevas.
-- ---------------------------------------------------------------------------

update public.memberships
set permissions = permissions || array['can_manage_cash_movements']
where role = 'cashier' and not (permissions @> array['can_manage_cash_movements']);
