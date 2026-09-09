-- Facturacion electronica AFIP/ARCA, directo contra los web services de ARCA (WSAA + WSFEv1),
-- sin intermediario. Cada negocio conecta su propio certificado (su propio CUIT) -- no hay una
-- cuenta unica de VentaRapida, ARCA factura en nombre de un CUIT especifico. La facturacion es
-- un paso posterior y desacoplado de process_sale: se dispara desde el frontend recien despues
-- de que la venta ya quedo guardada, y nunca bloquea ni revierte una venta (mismo principio que
-- ya rige el stock negativo).
--
-- Validado de punta a punta (login WSAA + FECAESolicitar, CAE real en homologacion) en
-- supabase/functions/arca-direct-test/ antes de escribir esta migracion -- ver el README de esa
-- funcion para el detalle completo de la investigacion.

-- ---------------------------------------------------------------------------
-- business_fiscal_settings: config + certificado por negocio (1:1 con businesses)
-- ---------------------------------------------------------------------------

create table public.business_fiscal_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  electronic_invoicing_enabled boolean not null default false,
  arca_environment text not null default 'homologacion'
    check (arca_environment in ('homologacion', 'produccion')),
  afip_punto_venta text,
  -- Condicion frente al IVA del propio negocio (emisor) -- determina la letra del comprobante
  -- (Factura A/B/C), ver la funcion determineCbteTipo en invoice-sale.
  emisor_condicion_iva text check (emisor_condicion_iva in ('RI', 'M', 'E')),
  -- Certificado y clave privada de ARCA, cifrados en reposo via Supabase Vault -- esta tabla
  -- solo guarda el id del secreto en vault.secrets, nunca el texto plano. Se escriben/leen
  -- exclusivamente via save_fiscal_credentials/get_fiscal_credentials (mas abajo), ambas
  -- restringidas a service_role -- ni siquiera el dueno del negocio puede leer el certificado de
  -- vuelta por API, solo puede volver a subir uno nuevo.
  arca_cert_secret_id uuid references vault.secrets (id),
  arca_private_key_secret_id uuid references vault.secrets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_fiscal_settings_set_updated_at
  before update on public.business_fiscal_settings
  for each row execute function public.set_updated_at();

alter table public.business_fiscal_settings enable row level security;

-- Permiso nuevo 'can_manage_invoicing': igual que el resto del catalogo, el owner siempre lo
-- tiene (has_permission hace `role = 'owner' or permissions @> array[...]`), y no se agrega a
-- los defaults de ningun otro rol -- solo el dueno ve/edita configuracion fiscal salvo que se
-- le otorgue el permiso explicitamente a un admin.
create policy business_fiscal_settings_select on public.business_fiscal_settings
  for select using (public.has_permission(business_id, 'can_manage_invoicing') or public.is_super_admin());

create policy business_fiscal_settings_manage on public.business_fiscal_settings
  for all
  using (public.has_permission(business_id, 'can_manage_invoicing'))
  with check (public.has_permission(business_id, 'can_manage_invoicing'));

-- Guarda (o reemplaza) el certificado/clave de un negocio en Vault. Solo se llama desde la Edge
-- Function save-fiscal-settings (service role) -- nunca directo desde el cliente, por eso no
-- depende de has_permission ni RLS: la funcion en si esta revocada de authenticated/anon mas
-- abajo, y la Edge Function ya valida can_manage_invoicing antes de llamarla.
create function public.save_fiscal_credentials(p_business_id uuid, p_cert text, p_private_key text)
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

-- Descifra el certificado/clave de un negocio. Solo la llama invoice-sale (service role) al
-- momento de facturar -- nunca se expone a un cliente autenticado normal.
create function public.get_fiscal_credentials(p_business_id uuid)
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

-- ---------------------------------------------------------------------------
-- payment_methods: que medios de pago disparan facturacion automatica (ej. "no facturar
-- efectivo") -- se reutiliza la tabla que ya existe en vez de inventar un sistema de reglas.
-- ---------------------------------------------------------------------------

alter table public.payment_methods add column invoicing_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- customers: datos fiscales opcionales, solo hacen falta si se factura a nombre de alguien en
-- vez de "Consumidor Final" (que no requiere estos datos para importes chicos, confirmado en
-- pruebas reales contra homologacion de ARCA -- ver supabase/functions/arca-direct-test/).
-- document/address ya existen y se reutilizan como numero de documento y domicilio.
-- ---------------------------------------------------------------------------

alter table public.customers add column document_type text;
alter table public.customers add column iva_condition text;
alter table public.customers add column province text;

-- ---------------------------------------------------------------------------
-- invoices: un comprobante AFIP por venta. Sin pdf_url/ticket_url -- a diferencia de un
-- intermediario, ARCA directo no aloja ningun PDF; el ticket propio muestra CAE + vencimiento
-- como texto (ver ticket-print). Generar el QR que exige AFIP en produccion (RG 4291) queda
-- fuera de este alcance.
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'issued', 'error', 'credit_note_pending', 'credit_note_issued')),
  external_reference text not null,
  comprobante_tipo text,
  comprobante_number text,
  cae text,
  cae_due_date date,
  error_message text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sale_id)
);

create index invoices_business_id_idx on public.invoices (business_id);
create index invoices_external_reference_idx on public.invoices (external_reference);

alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin policies de insert/update/delete: solo invoice-sale escribe aca, via service role -- mismo
-- criterio que sale_items.

-- ---------------------------------------------------------------------------
-- cancel_sale: si la venta ya tiene un comprobante emitido (status='issued'), no se lo puede
-- anular en silencio -- legalmente hace falta una Nota de Credito. Se sigue cancelando la venta
-- y revirtiendo stock como hoy (nunca se bloquea una cancelacion por esto), pero el comprobante
-- pasa a 'credit_note_pending' para que Historial de ventas avise y ofrezca emitir la NC a mano.
-- La emision automatica de la Nota de Credito queda fuera de este alcance.
-- ---------------------------------------------------------------------------

drop function if exists public.cancel_sale(uuid, text);

create function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
  v_component record;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;

  if v_sale is null then
    raise exception 'Venta no encontrada';
  end if;

  if not public.has_permission(v_sale.business_id, 'can_cancel_sales') then
    raise exception 'No tiene permiso para cancelar ventas';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'La venta ya esta cancelada';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id
  loop
    if exists (select 1 from public.sale_item_components where sale_item_id = v_item.id) then
      for v_component in
        select sic.component_product_id, sic.quantity
        from public.sale_item_components sic
        where sic.sale_item_id = v_item.id
      loop
        if exists (
          select 1 from public.products where id = v_component.component_product_id and track_stock = true
        ) then
          insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
          values (
            v_sale.business_id, v_component.component_product_id, 'cancellation', v_component.quantity,
            'Cancelacion venta #' || v_sale.sale_number, auth.uid()
          );
        end if;
      end loop;
    elsif exists (select 1 from public.products where id = v_item.product_id and track_stock = true) then
      insert into public.stock_movements (business_id, product_id, type, quantity, notes, created_by)
      values (
        v_sale.business_id, v_item.product_id, 'cancellation', v_item.quantity,
        'Cancelacion venta #' || v_sale.sale_number, auth.uid()
      );
    end if;
  end loop;

  update public.invoices
  set status = 'credit_note_pending'
  where sale_id = p_sale_id and status = 'issued';

  update public.sales
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;
