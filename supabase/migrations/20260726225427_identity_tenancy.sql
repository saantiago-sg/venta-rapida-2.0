-- Identidad y tenancy: businesses (tenant), profiles, memberships (N:N usuario<->negocio),
-- super_admins (acceso de plataforma, independiente de cualquier business_id).
-- Ver diseño acordado en el proceso de arquitectura (Fase 2/3) para el detalle de cada decisión.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  address text,
  logo_url text,
  currency text not null default 'ARS',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  cash_discount_percentage numeric(5, 2) not null default 0,
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'past_due', 'cancelled')),
  subscription_paid_until date,
  -- numeracion de ticket secuencial por negocio (incrementada con UPDATE ... RETURNING dentro de process_sale())
  next_sale_number bigint not null default 1,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'cashier')),
  -- permisos granulares activados encima del preset del rol (catalogo definido en Fase 4)
  permissions text[] not null default '{}',
  active boolean not null default true,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_business_id_idx on public.memberships (business_id);

create table public.super_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers de mantenimiento
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- Crea el profile automaticamente cuando Supabase Auth crea el auth.users.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guardrail (Fase 7): nunca se puede quitar/desactivar al ultimo owner activo de un negocio.
-- security definer para que el conteo no dependa de lo que el rol invocador pueda ver via RLS.
create function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := coalesce(old.business_id, new.business_id);
  v_remaining_owners int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'owner' and old.active
         and (new.role <> 'owner' or new.active = false)) then

    select count(*) into v_remaining_owners
    from public.memberships
    where business_id = v_business_id
      and role = 'owner'
      and active
      and id <> old.id;

    if v_remaining_owners = 0 then
      raise exception 'No se puede quitar al ultimo owner activo del negocio %', v_business_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_prevent_last_owner_removal
  before update or delete on public.memberships
  for each row execute function public.prevent_last_owner_removal();

-- ---------------------------------------------------------------------------
-- Funciones helper para RLS
-- security definer + no FORCE row level security en estas tablas: el rol dueno de la
-- migracion (postgres) sigue exento de RLS por default, asi estas funciones pueden leer
-- memberships sin re-entrar en sus propias policies (evita recursion). Los roles de
-- cliente (anon/authenticated) nunca son el dueno, asi que siguen 100% sujetos a RLS.
-- ---------------------------------------------------------------------------

create function public.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.active
  );
$$;

create function public.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.active
      and (m.role = 'owner' or m.permissions @> array[p_permission])
  );
$$;

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.super_admins sa where sa.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.super_admins enable row level security;

create policy businesses_select on public.businesses
  for select using (public.is_member(id) or public.is_super_admin());

create policy businesses_update on public.businesses
  for update
  using (public.has_permission(id, 'can_manage_settings'))
  with check (public.has_permission(id, 'can_manage_settings'));

create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());

create policy profiles_update on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy memberships_select on public.memberships
  for select using (
    user_id = auth.uid()
    or public.has_permission(business_id, 'can_manage_employees')
    or public.is_super_admin()
  );

create policy memberships_manage on public.memberships
  for all
  using (public.has_permission(business_id, 'can_manage_employees'))
  with check (public.has_permission(business_id, 'can_manage_employees'));

create policy super_admins_select on public.super_admins
  for select using (public.is_super_admin());
