-- Eliminar productos que ya se vendieron. Borrarlos de verdad no se puede (sale_items y
-- sale_item_components los referencian, y cancel_sale necesita el producto para devolver el
-- stock), asi que se marcan con deleted_at y la app deja de mostrarlos en todos lados.
-- Decision del dueño (2026-10-08): ocupa menos de 1 KB por producto eliminado, y no hay que
-- tocar ventas ni stock. Los productos que nunca se vendieron se siguen borrando de verdad
-- desde la app (ver ProductRepository.delete).
--
-- Al eliminar, la app tambien pone active = false: process_sale ya rechaza productos inactivos,
-- asi que una venta offline encolada con un producto eliminado no puede colarse.

alter table public.products
  add column deleted_at timestamptz;

-- El codigo de barras era unico por negocio entre TODOS los productos. Con productos eliminados
-- que quedan en la tabla, eso impedia volver a cargar un producto con el codigo de uno
-- eliminado (ej. se borro un duplicado y se lo vuelve a importar). Ahora solo es unico entre
-- los productos no eliminados.
drop index public.products_business_barcode_key;

create unique index products_business_barcode_key
  on public.products (business_id, barcode)
  where barcode is not null and deleted_at is null;
