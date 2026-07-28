import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { ProcessSaleInput, SaleResult } from './models';

interface SaleRow {
  id: string;
  sale_number: number;
  subtotal: number;
  discount_amount: number;
  total: number;
  change_given: number | null;
}

@Injectable({ providedIn: 'root' })
export class SaleRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async processSale(input: ProcessSaleInput): Promise<SaleResult> {
    const { data, error } = await this.supabase.rpc('process_sale', {
      p_business_id: input.businessId,
      p_items: input.items,
      p_payment_method_id: input.paymentMethodId,
      p_delivery_type_id: input.deliveryTypeId,
      p_customer_id: input.customerId,
      p_cash_received: input.cashReceived
    });
    if (error) throw error;

    const row = data as SaleRow;
    return {
      id: row.id,
      saleNumber: row.sale_number,
      subtotal: row.subtotal,
      discountAmount: row.discount_amount,
      total: row.total,
      changeGiven: row.change_given
    };
  }
}
