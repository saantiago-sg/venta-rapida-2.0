import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { PaymentMethod } from './models';

interface PaymentMethodRow {
  id: string;
  business_id: string;
  name: string;
  is_cash: boolean;
  active: boolean;
}

const SELECT_COLUMNS = 'id, business_id, name, is_cash, active';

function mapRow(row: PaymentMethodRow): PaymentMethod {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    isCash: row.is_cash,
    active: row.active
  };
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<PaymentMethod[]> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .select(SELECT_COLUMNS)
      .eq('business_id', businessId)
      .order('name');
    if (error) throw error;
    return (data as PaymentMethodRow[]).map(mapRow);
  }

  async create(businessId: string, name: string, isCash: boolean): Promise<PaymentMethod> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .insert({ business_id: businessId, name, is_cash: isCash })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data as PaymentMethodRow);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('payment_methods').update({ active }).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('payment_methods').delete().eq('id', id);
    if (error) throw error;
  }
}
