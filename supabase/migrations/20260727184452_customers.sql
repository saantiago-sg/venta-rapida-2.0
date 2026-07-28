-- Clientes: datos basicos + historial de compras (se deriva de sales.customer_id, no hay tabla aparte).
-- No hay un permiso especifico "can_manage_customers" en el catalogo de la Fase 4 -- cargar/editar
-- un cliente es una accion de bajo riesgo que cualquier empleado activo puede hacer (ej. un cajero
-- da de alta un cliente nuevo en el momento de la venta), a diferencia de productos/precios.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  document text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_business_id_idx on public.customers (business_id);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy customers_select on public.customers
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy customers_manage on public.customers
  for all
  using (public.is_member(business_id))
  with check (public.is_member(business_id));
