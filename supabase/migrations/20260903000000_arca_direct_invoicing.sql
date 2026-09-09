-- Reemplaza TusFacturasAPP por facturacion directa contra ARCA (ex AFIP), via WSAA + WSFEv1 --
-- ver supabase/functions/arca-direct-test/README.md para la investigacion que lo valido.
--
-- Migracion incremental, no una reescritura de 20260818190000_electronic_invoicing.sql: esa
-- migracion original ya se aplico a produccion (confirmado via `supabase migration list` +
-- inspeccion directa del esquema) con el shape viejo de TusFacturasAPP, aunque nunca llego a
-- usarse (business_fiscal_settings e invoices tienen 0 filas en produccion, confirmado antes de
-- escribir esto) -- por eso los drop column de abajo son seguros, no hay dato real que perder.
-- El archivo original se edito igual para que quede como documentacion del shape final, pero
-- `db push` no lo vuelve a correr (ya esta marcado como aplicado por nombre de archivo); esta
-- migracion nueva es la que efectivamente lleva produccion al shape nuevo.

alter table public.business_fiscal_settings
  drop column if exists tusfacturas_apitoken,
  drop column if exists tusfacturas_apikey,
  drop column if exists tusfacturas_usertoken,
  drop column if exists tusfacturas_webhook_token;

alter table public.business_fiscal_settings
  add column if not exists arca_environment text not null default 'homologacion'
    check (arca_environment in ('homologacion', 'produccion')),
  add column if not exists emisor_condicion_iva text check (emisor_condicion_iva in ('RI', 'M', 'E')),
  add column if not exists arca_cert_secret_id uuid references vault.secrets (id),
  add column if not exists arca_private_key_secret_id uuid references vault.secrets (id);

alter table public.invoices
  drop column if exists pdf_url,
  drop column if exists ticket_url;

-- create or replace (no create a secas): en un proyecto nuevo, 20260818190000 ya crea esta
-- misma funcion con este mismo contenido -- esta migracion tiene que ser segura de correr tanto
-- ahi (donde seria un no-op logico) como en produccion real (donde la version vieja de
-- 20260818190000, con el shape de TusFacturasAPP, nunca creo esta funcion).
create or replace function public.save_fiscal_credentials(p_business_id uuid, p_cert text, p_private_key text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing record;
  v_cert_id uuid;
  v_key_id uuid;
begin
  select arca_cert_secret_id, arca_private_key_secret_id into v_existing
  from public.business_fiscal_settings where business_id = p_business_id;

  if v_existing.arca_cert_secret_id is not null then
    perform vault.update_secret(v_existing.arca_cert_secret_id, p_cert);
    v_cert_id := v_existing.arca_cert_secret_id;
  else
    v_cert_id := vault.create_secret(p_cert, 'arca_cert_' || p_business_id::text);
  end if;

  if v_existing.arca_private_key_secret_id is not null then
    perform vault.update_secret(v_existing.arca_private_key_secret_id, p_private_key);
    v_key_id := v_existing.arca_private_key_secret_id;
  else
    v_key_id := vault.create_secret(p_private_key, 'arca_key_' || p_business_id::text);
  end if;

  update public.business_fiscal_settings
  set arca_cert_secret_id = v_cert_id, arca_private_key_secret_id = v_key_id
  where business_id = p_business_id;
end;
$$;

create or replace function public.get_fiscal_credentials(p_business_id uuid)
returns table (cert text, private_key text)
language sql
security definer
set search_path = public, vault
as $$
  select cs.decrypted_secret, ks.decrypted_secret
  from public.business_fiscal_settings s
  join vault.decrypted_secrets cs on cs.id = s.arca_cert_secret_id
  join vault.decrypted_secrets ks on ks.id = s.arca_private_key_secret_id
  where s.business_id = p_business_id;
$$;

revoke all on function public.save_fiscal_credentials(uuid, text, text) from public, authenticated, anon;
revoke all on function public.get_fiscal_credentials(uuid) from public, authenticated, anon;
grant execute on function public.save_fiscal_credentials(uuid, text, text) to service_role;
grant execute on function public.get_fiscal_credentials(uuid) to service_role;
