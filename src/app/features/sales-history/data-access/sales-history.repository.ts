import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { SaleItem, SaleListItem, SaleStatus } from './models';

interface SaleItemProfitRow {
  quantity: number;
  unit_price: number;
  unit_cost: number;
}

interface SaleRow {
  id: string;
  sale_number: number;
  status: SaleStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  created_at: string;
  cancel_reason: string | null;
  payment_method_id: string | null;
  customers: { name: string } | { name: string }[] | null;
  employee: { email: string | null } | { email: string | null }[] | null;
  payment_methods: { name: string; is_cash: boolean } | { name: string; is_cash: boolean }[] | null;
  delivery_types: { name: string } | { name: string }[] | null;
  sale_items: SaleItemProfitRow[] | null;
}

interface SaleItemRow {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  subtotal: number;
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface SalesHistoryFilters {
  paymentMethodId: string | null;
  // Coincide por substring sobre el numero de pedido como texto (mismo criterio que el
  // filtro anterior en el cliente: "12" matchea el pedido #12, #120, #512, etc.).
  orderNumberQuery: string;
}

export interface SalesHistoryPage {
  items: SaleListItem[];
  totalCount: number;
}

// Mismo criterio que get_sales_summary (RPC de reportes): ganancia = suma de
// (precio - costo) * cantidad de cada linea, con precio/costo ya "congelados" al momento
// de la venta (sale_items.unit_price/unit_cost son snapshots, no el precio actual).
function itemsProfit(items: SaleItemProfitRow[] | null): number {
  if (!items) return 0;
  return items.reduce((sum, item) => sum + (item.unit_price - item.unit_cost) * item.quantity, 0);
}

function mapSale(row: SaleRow): SaleListItem {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    customerName: first(row.customers)?.name ?? null,
    employeeEmail: first(row.employee)?.email ?? null,
    paymentMethodId: row.payment_method_id,
    paymentMethodName: first(row.payment_methods)?.name ?? '',
    paymentMethodIsCash: first(row.payment_methods)?.is_cash ?? false,
    deliveryTypeName: first(row.delivery_types)?.name ?? '',
    status: row.status,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    total: row.total,
    profit: itemsProfit(row.sale_items),
    createdAt: row.created_at,
    cancelReason: row.cancel_reason
  };
}

@Injectable({ providedIn: 'root' })
export class SalesHistoryRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  // Sin "page", trae todo lo que matchee los filtros (usado para exportar: el export tiene
  // que reflejar todo lo filtrado, no solo la pagina que esta viendo el usuario en pantalla).
  // Con "page", trae solo esa tanda + el total real de filas que matchean (para el paginador).
  async list(
    businessId: string,
    dateFrom: Date | undefined,
    dateTo: Date | undefined,
    filters: SalesHistoryFilters,
    page?: { first: number; rows: number }
  ): Promise<SalesHistoryPage> {
    let query = this.supabase
      .from('sales')
      .select(
        'id, sale_number, status, subtotal, discount_amount, tax_amount, total, created_at, cancel_reason, payment_method_id, customers(name), employee:profiles!sales_employee_id_fkey(email), payment_methods(name, is_cash), delivery_types(name), sale_items(quantity, unit_price, unit_cost)',
        { count: 'exact' }
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (dateFrom) query = query.gte('created_at', dateFrom.toISOString());
    if (dateTo) query = query.lt('created_at', dateTo.toISOString());
    if (filters.paymentMethodId) query = query.eq('payment_method_id', filters.paymentMethodId);
    const orderNumberQuery = filters.orderNumberQuery.trim();
    if (orderNumberQuery) query = query.filter('sale_number::text', 'ilike', `%${orderNumberQuery}%`);
    if (page) query = query.range(page.first, page.first + page.rows - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { items: (data as unknown as SaleRow[]).map(mapSale), totalCount: count ?? 0 };
  }

  async getItems(saleId: string): Promise<SaleItem[]> {
    const { data, error } = await this.supabase
      .from('sale_items')
      .select('id, product_name, quantity, unit_price, tax_amount, subtotal')
      .eq('sale_id', saleId);
    if (error) throw error;
    return (data as SaleItemRow[]).map((row) => ({
      id: row.id,
      productName: row.product_name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      taxAmount: row.tax_amount,
      subtotal: row.subtotal
    }));
  }

  async cancel(saleId: string, reason: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason });
    if (error) throw error;
  }
}
