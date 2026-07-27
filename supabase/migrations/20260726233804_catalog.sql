-- Catalogo: categories, taxes, products, stock_movements (ledger inmutable -> stock cacheado).
-- Ver diseño acordado (Fase 2/3): categoria opcional, stock via ledger, impuestos configurables.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index categories_business_id_idx on public.categories (business_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create table public.taxes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  rate numeric(5, 2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index taxes_business_id_idx on public.taxes (business_id);

create trigger taxes_set_updated_at
  before update on public.taxes
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- categoria opcional: categorizar no debe ser obligatorio para cargar un producto rapido
  category_id uuid references public.categories (id) on delete set null,
  tax_id uuid references public.taxes (id) on delete set null,
  name text not null,
  barcode text,
  sku text,
  sale_type text not null default 'unit' check (sale_type in ('unit', 'weight')),
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  -- cacheado: la fuente de verdad es stock_movements, nunca se escribe directo desde el cliente
  stock numeric(12, 3) not null default 0,
  track_stock boolean not null default true,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_business_id_idx on public.products (business_id);
create index products_category_id_idx on public.products (category_id);
create unique index products_business_barcode_key on public.products (business_id, barcode) where barcode is not null;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  type text not null check (type in ('sale', 'purchase', 'adjustment', 'initial', 'cancellation')),
  -- delta: positivo suma stock, negativo resta (ej. una venta inserta un delta negativo)
  quantity numeric(12, 3) not null,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index stock_movements_business_id_idx on public.stock_movements (business_id);
create index stock_movements_product_id_idx on public.stock_movements (product_id);

create function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock = stock + new.quantity
  where id = new.product_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.taxes enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

create policy categories_select on public.categories
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy categories_manage on public.categories
  for all
  using (public.has_permission(business_id, 'can_manage_products'))
  with check (public.has_permission(business_id, 'can_manage_products'));

create policy taxes_select on public.taxes
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy taxes_manage on public.taxes
  for all
  using (public.has_permission(business_id, 'can_manage_settings'))
  with check (public.has_permission(business_id, 'can_manage_settings'));

create policy products_select on public.products
  for select using (public.is_member(business_id) or public.is_super_admin());

create policy products_manage on public.products
  for all
  using (public.has_permission(business_id, 'can_manage_products'))
  with check (public.has_permission(business_id, 'can_manage_products'));

create policy stock_movements_select on public.stock_movements
  for select using (public.is_member(business_id) or public.is_super_admin());

-- El ledger es insert-only desde el cliente: nunca se actualiza ni se borra un movimiento.
create policy stock_movements_insert on public.stock_movements
  for insert
  with check (public.has_permission(business_id, 'can_manage_products'));
