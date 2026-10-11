import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { SalesSummary, TopProduct } from './models';

interface SummaryRow {
  total_sales: number;
  total_profit: number;
  total_tax: number;
  sale_count: number;
}

interface TopProductRow {
  product_name: string;
  quantity_sold: number;
  revenue: number;
  profit: number;
}

@Injectable({ providedIn: 'root' })
export class ReportsRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  // filters: los mismos que aplica la tabla del historial de ventas, para que las cards sumen
  // exactamente las ventas filtradas. El dashboard no los pasa (todo el rango).
  async getSummary(
    businessId: string,
    dateFrom: Date,
    dateTo: Date,
    filters?: { paymentMethodId: string | null; orderNumberQuery: string }
  ): Promise<SalesSummary> {
    const { data, error } = await this.supabase
      .rpc('get_sales_summary', {
        p_business_id: businessId,
        p_date_from: dateFrom.toISOString(),
        p_date_to: dateTo.toISOString(),
        // Solo si vienen: asi la llamada del dashboard queda identica a la de antes de
        // 20261011120000_sales_summary_filters.sql.
        ...(filters && {
          p_payment_method_id: filters.paymentMethodId,
          p_order_number_query: filters.orderNumberQuery.trim() || null
        })
      })
      .single();
    if (error) throw error;

    const row = data as SummaryRow;
    return {
      totalSales: row.total_sales,
      totalProfit: row.total_profit,
      totalTax: row.total_tax,
      saleCount: row.sale_count
    };
  }

  async getTopProducts(businessId: string, dateFrom: Date, dateTo: Date, limit = 10): Promise<TopProduct[]> {
    const { data, error } = await this.supabase.rpc('get_top_products', {
      p_business_id: businessId,
      p_date_from: dateFrom.toISOString(),
      p_date_to: dateTo.toISOString(),
      p_limit: limit
    });
    if (error) throw error;

    return (data as TopProductRow[]).map((row) => ({
      productName: row.product_name,
      quantitySold: row.quantity_sold,
      revenue: row.revenue,
      profit: row.profit
    }));
  }
}
