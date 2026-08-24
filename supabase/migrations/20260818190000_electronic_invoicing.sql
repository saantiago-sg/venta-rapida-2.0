-- Facturacion electronica AFIP/ARCA via TusFacturasAPP. Cada negocio conecta su propia cuenta
-- de TusFacturasAPP (su propio CUIT) -- no hay una cuenta unica de VentaRapida, TusFacturasAPP
-- factura en nombre de un CUIT especifico. La facturacion es un paso posterior y desacoplado de
-- process_sale: se dispara desde el frontend recien despues de que la venta ya quedo guardada,
-- y nunca bloquea ni revierte una venta (mismo principio que ya rige el stock negativo).

-- ---------------------------------------------------------------------------
-- business_fiscal_settings: config + credenciales por negocio (1:1 con businesses)
-- ---------------------------------------------------------------------------

create table public.business_fiscal_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  electronic_invoicing_enabled boolean not null default false,
  afip_punto_venta text,
  tusfacturas_apitoken text,
  tusfacturas_apikey text,
  tusfacturas_usertoken text,
  -- El dueño configura un webhook en su cuenta de TusFacturasAPP apuntando a
  -- tusfacturas-webhook con este mismo token (header TF-WebhookToken) -- asi el receptor sabe
  -- a que negocio pertenece un evento antes de confiar en su external_reference.
  tusfacturas_webhook_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_fiscal_settings_set_updated_at
  before update on public.business_fiscal_settings
  for each row execute function public.set_updated_at();

alter table public.business_fiscal_settings enable row level security;

-- Permiso nuevo 'can_manage_invoicing': igual que el resto del catalogo, el owner siempre lo
-- tiene (has_permission hace `role = 'owner' or permissions @> array[...]`), y no se agrega a
-- los defaults de ningun otro rol -- solo el dueno ve/edita credenciales fiscales salvo que se
-- le otorgue el permiso explicitamente a un admin.
create policy business_fiscal_settings_select on public.business_fiscal_settings
  for select using (public.has_permission(business_id, 'can_manage_invoicing') or public.is_super_admin());

create policy business_fiscal_settings_manage on public.business_fiscal_settings
  for all
  using (public.has_permission(business_id, 'can_manage_invoicing'))
  with check (public.has_permission(business_id, 'can_manage_invoicing'));

-- ---------------------------------------------------------------------------
-- payment_methods: que medios de pago disparan facturacion automatica (ej. "no facturar
-- efectivo") -- se reutiliza la tabla que ya existe en vez de inventar un sistema de reglas.
-- ---------------------------------------------------------------------------

alter table public.payment_methods add column invoicing_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- customers: datos fiscales opcionales, solo hacen falta si se factura a nombre de alguien en
-- vez de "Consumidor Final" (que no requiere estos datos para importes chicos, ver
-- https://developers.tusfacturas.app/.../facturas-a-consumidor-final-sin-especificar-datos).
-- document/address ya existen y se reutilizan como numero de documento y domicilio.
-- ---------------------------------------------------------------------------

alter table public.customers add column document_type text;
alter table public.customers add column iva_condition text;
alter table public.customers add column province text;

-- ---------------------------------------------------------------------------
-- invoices: un comprobante AFIP por venta
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
  pdf_url text,
  ticket_url text,
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

-- Sin policies de insert/update/delete: solo las Edge Functions (invoice-sale,
-- tusfacturas-webhook) escriben aca, via service role -- mismo criterio que sale_items.

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
