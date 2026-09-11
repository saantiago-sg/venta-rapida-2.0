-- Borrado real de un negocio desde Super Admin.
--
-- 1) prevent_last_owner_removal bloqueaba tambien el borrado completo de un negocio, porque el
--    ON DELETE CASCADE de businesses -> memberships dispara este trigger fila por fila y cuenta
--    0 owners restantes. Se agrega un bypass explicito via variable de sesion transaccional
--    (set_config con local=true, se revierte solo al terminar la transaccion) en vez de deshabilitar
--    el trigger a nivel catalogo (ALTER TABLE ... DISABLE TRIGGER afecta a todas las sesiones) o
--    apagar todos los triggers de la transaccion (SET LOCAL session_replication_role = replica).
--    Es quirurgico: solo bypassea la proteccion para el negocio puntual que se esta borrando.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := coalesce(old.business_id, new.business_id);
  v_remaining_owners int;
begin
  if current_setting('vr.deleting_business', true) = v_business_id::text then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

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

-- 2) RPC que orquesta el borrado completo de un negocio: activa el bypass del trigger de arriba,
--    borra la fila de businesses (el ON DELETE CASCADE existente limpia memberships, products,
--    sales, sale_items, stock_movements, cash_sessions, customers, invoices, business_fiscal_settings,
--    etc.), y borra los secrets de vault que el cascade no puede alcanzar (arca_cert_secret_id /
--    arca_private_key_secret_id). auth.users/profiles del owner NO se tocan a proposito: son cuentas
--    de login independientes del negocio, borrarlas es una decision manual aparte.
--    Mismo esquema de permisos que save_fiscal_credentials: revocado para clientes autenticados/anon,
--    solo invocable con la service-role key (la Edge Function delete-business es quien valida
--    is_super_admin() antes de llamar esto).
create or replace function public.admin_delete_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_business record;
  v_fiscal record;
begin
  select id, name into v_business from public.businesses where id = p_business_id;
  if not found then
    raise exception 'Negocio % no existe', p_business_id;
  end if;

  select arca_cert_secret_id, arca_private_key_secret_id
    into v_fiscal
    from public.business_fiscal_settings
    where business_id = p_business_id;

  perform set_config('vr.deleting_business', p_business_id::text, true);

  delete from public.businesses where id = p_business_id;

  -- vault.secrets es una tabla comun (no hay una funcion vault.delete_secret) -- se borra
  -- con un DELETE directo, igual que cualquier otra fila.
  if v_fiscal.arca_cert_secret_id is not null then
    delete from vault.secrets where id = v_fiscal.arca_cert_secret_id;
  end if;
  if v_fiscal.arca_private_key_secret_id is not null then
    delete from vault.secrets where id = v_fiscal.arca_private_key_secret_id;
  end if;

  return jsonb_build_object('id', v_business.id, 'name', v_business.name);
end;
$$;

revoke all on function public.admin_delete_business(uuid) from public, authenticated, anon;
grant execute on function public.admin_delete_business(uuid) to service_role;
