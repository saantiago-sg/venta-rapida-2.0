-- Fecha de vencimiento del producto: campo simple y opcional (Opcion A acordada con el
-- usuario). Sin lotes -- un solo valor por producto, se pisa en cada reposicion. No requiere
-- cambios de RLS, es una columna mas en una tabla ya protegida por las policies existentes.

alter table public.products
  add column expiration_date date;
