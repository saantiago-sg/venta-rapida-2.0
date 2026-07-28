-- Caja: apertura/cierre de turno + movimientos manuales (ingresos/egresos).
-- Ver Fase 2/3/4: "can_manage_cash_movements" cubre movimientos manuales, no abrir/cerrar caja
-- (eso es una tarea operativa de cualquier empleado activo, no un permiso administrativo).

create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default 'Caja principal',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index cash_registers_business_id_idx on public.cash_registers (business_id);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers (id) on delete cascade,
  opened_by uuid references public.profiles (id),
  opened_at timestamptz not null default now(),
  opening_amount numeric(12, 2) not null,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  expected_amount numeric(12, 2),
  closing_amount numeric(12, 2),
  difference numeric(12, 2),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text
);

create index cash_sessions_business_id_idx on public.cash_sessions (business_id);
create index cash_sessions_register_open_idx on public.cash_sessions (cash_register_id) where status = 'open';

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'sale', 'withdrawal')),
  -- delta firmado: positivo suma al cajon de efectivo, negativo resta
  amount numeric(12, 2) not null,
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index cash_movements_session_id_idx on public.cash_movements (cash_session_id);
create index cash_movements_business_id_idx on public.cash_movements (business_id);

create function public.prevent_movement_on_closed_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.cash_sessions where id = new.cash_session_id;
  if v_status <> 'open' then
    raise exception 'La caja ya esta cerrada, no se pueden agregar movimientos';
  end if;
  return new;
end;
$$;

create trigger cash_movements_prevent_closed
  before insert on public.cash_movements
  for each row execute function public.prevent_movement_on_closed_session();

-- RPCs: abrir/cerrar caja quedan fuera de RLS de insert/update directo a proposito,
-- solo se puede a traves de estas funciones (evita dos aperturas simultaneas y calcula
-- el monto esperado en el cierre, ver Fase 3: la agregacion no va del lado del cliente).

create function public.open_cash_session(p_cash_register_id uuid, p_opening_amount numeric)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_existing uuid;
  v_session public.cash_sessions;
begin
  select business_id into v_business_id from public.cash_registers where id = p_cash_register_id;

  if v_business_id is null then
    raise exception 'Caja no encontrada';
  end if;

  if not public.is_member(v_business_id) then
    raise exception 'No pertenece a este negocio';
  end if;

  select id into v_existing from public.cash_sessions
  where cash_register_id = p_cash_register_id and status = 'open';

  if v_existing is not null then
    raise exception 'Ya hay una caja abierta';
  end if;

  insert into public.cash_sessions (business_id, cash_register_id, opened_by, opening_amount, status)
  values (v_business_id, p_cash_register_id, auth.uid(), p_opening_amount, 'open')
  returning * into v_session;

  return v_session;
end;
$$;

create function public.close_cash_session(p_session_id uuid, p_closing_amount numeric, p_notes text default null)
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
    raise exception 'Sesion de caja no encontrada';
  end if;

  if not public.is_member(v_session.business_id) then
    raise exception 'No pertenece a este negocio';
  end if;

  if v_session.status <> 'open' then
    raise exception 'La caja ya esta cerrada';
  end if;

  select v_session.opening_amount + coalesce(sum(amount), 0)
  into v_expected
  from public.cash_movements
  where cash_session_id = p_session_id;

  update public.cash_sessions
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      closing_amount = p_closing_amount,
      expected_amount = v_expected,
      difference = p_closing_amount - v_expected,
      notes = p_notes
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cash_registers enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

create policy cash_registers_select on public.cash_registers
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin policy de insert/update: la caja principal se siembra sola al crear el negocio.

create policy cash_sessions_select on public.cash_sessions
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin policy de insert/update: abrir/cerrar solo via las funciones de arriba (security definer).

create policy cash_movements_select on public.cash_movements
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy cash_movements_insert on public.cash_movements
  for insert
  with check (
    type in ('income', 'expense')
    and public.has_permission(business_id, 'can_manage_cash_movements')
  );

-- Siembra la caja principal para negocios nuevos (extiende el seed de la Fase de settings).
create or replace function public.seed_business_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_methods (business_id, name, is_cash) values
    (new.id, 'Efectivo', true),
    (new.id, 'Débito', false),
    (new.id, 'Crédito', false),
    (new.id, 'Transferencia', false),
    (new.id, 'Cuenta Corriente', false),
    (new.id, 'Otro', false);

  insert into public.delivery_types (business_id, name) values
    (new.id, 'Retiro en local'),
    (new.id, 'Envío');

  insert into public.cash_registers (business_id, name) values
    (new.id, 'Caja principal');

  return new;
end;
$$;
