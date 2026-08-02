-- Empleados: agrega email a profiles (para poder listar quien es quien) y abre la RLS de
-- profiles para que un dueño/admin con can_manage_employees vea los perfiles de la gente
-- que comparte negocio con el/ella (antes cada quien solo se veia a si mismo).

alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.business_id = mine.business_id
      where mine.user_id = auth.uid()
        and mine.active
        and public.has_permission(mine.business_id, 'can_manage_employees')
        and theirs.user_id = profiles.id
        and theirs.active
    )
  );
