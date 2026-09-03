-- Setup de datos de prueba para la auditoria activa de aislamiento multi-tenant.
-- Correr con: supabase db query --linked --file supabase/audit_setup.sql
-- Requiere que ya existan (Dashboard > Authentication > Users, con Auto Confirm User) los 3
-- usuarios de abajo. No usa service_role ni auth.admin -- son inserts SQL directos, corridos
-- como el rol de la conexion (postgres), que no esta sujeto a RLS.

do $$
declare
  v_owner_a_id uuid;
  v_owner_b_id uuid;
  v_cashier_a_id uuid;
  v_business_a_id uuid;
  v_business_b_id uuid;
  v_product_a_id uuid;
  v_product_b_id uuid;
  v_customer_a_id uuid;
  v_customer_b_id uuid;
  v_pm_a_id uuid;
  v_pm_b_id uuid;
  v_dt_a_id uuid;
  v_dt_b_id uuid;
  v_sale_a_id uuid;
  v_sale_b_id uuid;
begin
  select id into v_owner_a_id from auth.users where email = 'audit-owner-a@ventarapida.test';
  select id into v_owner_b_id from auth.users where email = 'audit-owner-b@ventarapida.test';
  select id into v_cashier_a_id from auth.users where email = 'audit-cashier-a@ventarapida.test';

  if v_owner_a_id is null or v_owner_b_id is null or v_cashier_a_id is null then
    raise exception 'Falta crear alguno de los 3 usuarios de prueba en Authentication > Users primero';
  end if;

  insert into public.businesses (name) values ('Auditoria Negocio A') returning id into v_business_a_id;
  insert into public.businesses (name) values ('Auditoria Negocio B') returning id into v_business_b_id;

  insert into public.memberships (user_id, business_id, role, permissions) values
    (v_owner_a_id, v_business_a_id, 'owner', '{}'),
    (v_owner_b_id, v_business_b_id, 'owner', '{}'),
    (v_cashier_a_id, v_business_a_id, 'cashier', '{}'); -- cashier sin ningun permiso extra a proposito

  insert into public.products (business_id, name, price, cost, stock, track_stock)
  values (v_business_a_id, 'Producto Auditoria A', 1000, 500, 50, true)
  returning id into v_product_a_id;

  insert into public.products (business_id, name, price, cost, stock, track_stock)
  values (v_business_b_id, 'Producto Auditoria B', 2000, 800, 30, true)
  returning id into v_product_b_id;

  insert into public.customers (business_id, name, phone)
  values (v_business_a_id, 'Cliente Auditoria A', '1111')
  returning id into v_customer_a_id;

  insert into public.customers (business_id, name, phone)
  values (v_business_b_id, 'Cliente Auditoria B', '2222')
  returning id into v_customer_b_id;

  select id into v_pm_a_id from public.payment_methods where business_id = v_business_a_id and name = 'Efectivo';
  select id into v_pm_b_id from public.payment_methods where business_id = v_business_b_id and name = 'Efectivo';
  select id into v_dt_a_id from public.delivery_types where business_id = v_business_a_id and name = 'Retiro en local';
  select id into v_dt_b_id from public.delivery_types where business_id = v_business_b_id and name = 'Retiro en local';

  insert into public.sales (
    business_id, sale_number, customer_id, employee_id, payment_method_id, delivery_type_id,
    subtotal, discount_amount, tax_amount, total
  ) values (
    v_business_a_id, 1, v_customer_a_id, v_owner_a_id, v_pm_a_id, v_dt_a_id, 1000, 0, 0, 1000
  ) returning id into v_sale_a_id;

  insert into public.sale_items (sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost, subtotal)
  values (v_sale_a_id, v_business_a_id, v_product_a_id, 'Producto Auditoria A', 1, 1000, 500, 1000);

  update public.businesses set next_sale_number = 2 where id = v_business_a_id;

  insert into public.sales (
    business_id, sale_number, customer_id, employee_id, payment_method_id, delivery_type_id,
    subtotal, discount_amount, tax_amount, total
  ) values (
    v_business_b_id, 1, v_customer_b_id, v_owner_b_id, v_pm_b_id, v_dt_b_id, 2000, 0, 0, 2000
  ) returning id into v_sale_b_id;

  insert into public.sale_items (sale_id, business_id, product_id, product_name, quantity, unit_price, unit_cost, subtotal)
  values (v_sale_b_id, v_business_b_id, v_product_b_id, 'Producto Auditoria B', 1, 2000, 800, 2000);

  update public.businesses set next_sale_number = 2 where id = v_business_b_id;

  raise notice 'business_a_id=%', v_business_a_id;
  raise notice 'business_b_id=%', v_business_b_id;
  raise notice 'product_a_id=%', v_product_a_id;
  raise notice 'product_b_id=%', v_product_b_id;
  raise notice 'customer_a_id=%', v_customer_a_id;
  raise notice 'customer_b_id=%', v_customer_b_id;
  raise notice 'sale_a_id=%', v_sale_a_id;
  raise notice 'sale_b_id=%', v_sale_b_id;
end $$;
