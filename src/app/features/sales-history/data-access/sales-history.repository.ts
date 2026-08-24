import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { InvoiceSaleResult } from '../../pos/data-access/models';
import { InvoiceStatus, SaleItem, SaleListItem, SaleStatus } from './models';

interface InvoiceRow {
  status: InvoiceStatus;
  pdf_url: string | null;
  ticket_url: string | null;
  error_message: string | null;
}

interface SaleRow {
  id: string;
  sale_number: number;
  status: SaleStatus;
  subtotal: number;
  discount_amount: number;
  total: number;
  created_at: string;
  cancel_reason: string | null;
  payment_method_id: string | null;
  customers: { name: string } | { name: string }[] | null;
  payment_methods: { name: string; is_cash: boolean } | { name: string; is_cash: boolean }[] | null;
  delivery_types: { name: string } | { name: string }[] | null;
  invoices: InvoiceRow | InvoiceRow[] | null;
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
  const invoice = first(row.invoices);
  return {
    id: row.id,
    saleNumber: row.sale_number,
    customerName: first(row.customers)?.name ?? null,
    paymentMethodId: row.payment_method_id,
    paymentMethodName: first(row.payment_methods)?.name ?? '',
    paymentMethodIsCash: first(row.payment_methods)?.is_cash ?? false,
    deliveryTypeName: first(row.delivery_types)?.name ?? '',
    status: row.status,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    total: row.total,
    createdAt: row.created_at,
    cancelReason: row.cancel_reason,
    invoice: invoice
      ? {
          status: invoice.status,
          pdfUrl: invoice.pdf_url,
          ticketUrl: invoice.ticket_url,
          errorMessage: invoice.error_message
        }
      : null
  };
}

@Injectable({ providedIn: 'root' })
export class SalesHistoryRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string, dateFrom?: Date, dateTo?: Date): Promise<SaleListItem[]> {
    let query = this.supabase
      .from('sales')
      .select(
        'id, sale_number, status, subtotal, discount_amount, total, created_at, cancel_reason, payment_method_id, customers(name), payment_methods(name, is_cash), delivery_types(name), invoices(status, pdf_url, ticket_url, error_message)'
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (dateFrom) query = query.gte('created_at', dateFrom.toISOString());
    if (dateTo) query = query.lt('created_at', dateTo.toISOString());

    const { data, error } = await query;
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

  // Reintenta una factura en 'error' -- misma Edge Function que dispara la venta en el momento,
  // invoice-sale es idempotente (actualiza la fila existente en vez de duplicarla).
  async retryInvoice(saleId: string): Promise<InvoiceSaleResult> {
    const { data, error } = await this.supabase.functions.invoke('invoice-sale', { body: { saleId } });
    if (error) throw error;
    return (data ?? {}) as InvoiceSaleResult;
  }
}
