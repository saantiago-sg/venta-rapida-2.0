-- Facturador standalone: emitir un comprobante ARCA suelto (sin venta del POS de por medio) --
-- misma necesidad que resuelve facturador.afip.gob.ar hoy, pero sin salir de VentaRapida. No
-- toca sales/process_sale/invoices -- es un flujo 100% independiente del checkout.
--
-- Tabla nueva en vez de reusar `invoices`: esa tabla es 1:1 con `sales` (unique(sale_id)) y su
-- RLS/escritura asume siempre una venta de por medio -- mezclar los dos conceptos rompe esa
-- relacion en vez de simplificarla.

create table public.standalone_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  issued_by uuid references public.profiles (id),
  status text not null check (status in ('issued', 'error')),
  emission_date date not null,
  doc_tipo integer not null,
  doc_nro text not null,
  receptor_name text not null,
  receptor_condicion_iva text,
  monto_total numeric(12, 2) not null check (monto_total > 0),
  iva_rate numeric(5, 2),
  comprobante_tipo text,
  comprobante_number text,
  cae text,
  cae_due_date date,
  error_message text,
  created_at timestamptz not null default now()
);

create index standalone_invoices_business_id_idx on public.standalone_invoices (business_id);

alter table public.standalone_invoices enable row level security;

create policy standalone_invoices_select on public.standalone_invoices
  for select using (public.is_member(business_id) or public.is_super_admin());

-- Sin insert/update/delete: solo issue-standalone-invoice (service role) escribe, mismo criterio
-- que `invoices`. Cada intento (exitoso o con error) inserta una fila nueva -- a diferencia de
-- invoice-sale no hay un sale_id que le de idempotencia a un reintento; cada envio del
-- formulario es su propio intento, sin necesidad de upsert.
