import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { SaleItem, SaleListItem, SaleStatus } from './models';

interface SaleRow {
  id: string;
  sale_number: number;
  status: SaleStatus;
  total: number;
  created_at: string;
  cancel_reason: string | null;
  customers: { name: string } | { name: string }[] | null;
  payment_methods: { name: string; is_cash: boolean } | { name: string; is_cash: boolean }[] | null;
  delivery_types: { name: string } | { name: string }[] | null;
}

interface SaleItemRow {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapSale(row: SaleRow): SaleListItem {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    customerName: first(row.customers)?.name ?? null,
    paymentMethodName: first(row.payment_methods)?.name ?? '',
    paymentMethodIsCash: first(row.payment_methods)?.is_cash ?? false,
    deliveryTypeName: first(row.delivery_types)?.name ?? '',
    status: row.status,
    total: row.total,
    createdAt: row.created_at,
    cancelReason: row.cancel_reason
  };
}

@Injectable({ providedIn: 'root' })
export class SalesHistoryRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<SaleListItem[]> {
    const { data, error } = await this.supabase
      .from('sales')
      .select(
        'id, sale_number, status, total, created_at, cancel_reason, customers(name), payment_methods(name, is_cash), delivery_types(name)'
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as SaleRow[]).map(mapSale);
  }

  async getItems(saleId: string): Promise<SaleItem[]> {
    const { data, error } = await this.supabase
      .from('sale_items')
      .select('id, product_name, quantity, unit_price, subtotal')
      .eq('sale_id', saleId);
    if (error) throw error;
    return (data as SaleItemRow[]).map((row) => ({
      id: row.id,
      productName: row.product_name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      subtotal: row.subtotal
    }));
  }

  async cancel(saleId: string, reason: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason });
    if (error) throw error;
  }
}
