-- Configuracion: medios de pago y tipos de entrega (configurables por negocio, ver Fase 2/6).
-- Se auto-siembran valores por defecto al crear un negocio nuevo para que la venta no quede
-- bloqueada por falta de configuracion (sales.payment_method_id / delivery_type_id son NOT NULL).
-- Los impuestos (taxes) y los datos del negocio (businesses) ya existen de migraciones previas.

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  is_cash boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_methods_business_id_idx on public.payment_methods (business_id);

create trigger payment_methods_set_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

create table public.delivery_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index delivery_types_business_id_idx on public.delivery_types (business_id);

create trigger delivery_types_set_updated_at
  before update on public.delivery_types
  for each row execute function public.set_updated_at();

alter table public.payment_methods enable row level security;
alter table public.delivery_types enable row level security;

create policy payment_methods_select on public.payment_methods
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy payment_methods_manage on public.payment_methods
  for all
  using (public.has_permission(business_id, 'can_manage_settings'))
  with check (public.has_permission(business_id, 'can_manage_settings'));

create policy delivery_types_select on public.delivery_types
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy delivery_types_manage on public.delivery_types
  for all
  using (public.has_permission(business_id, 'can_manage_settings'))
  with check (public.has_permission(business_id, 'can_manage_settings'));

create function public.seed_business_defaults()
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

  return new;
end;
$$;

create trigger businesses_seed_defaults
  after insert on public.businesses
  for each row execute function public.seed_business_defaults();
