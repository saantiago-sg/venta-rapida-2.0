-- Historial de ventas y facturas filtran siempre por business_id + rango de fecha y ordenan
-- por created_at desc (ver sales-history.repository.ts). El indice business_id solo no cubre
-- el order/range una vez que la tabla crece; este compuesto evita el sort en memoria.

create index sales_business_id_created_at_idx on public.sales (business_id, created_at desc);
