import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { BusinessSettings, BusinessSettingsFormValue } from './models';

interface BusinessRow {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cash_discount_percentage: number;
}

const SELECT_COLUMNS = 'id, name, legal_name, tax_id, email, phone, address, cash_discount_percentage';

function mapRow(row: BusinessRow): BusinessSettings {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    address: row.address,
    cashDiscountPercentage: row.cash_discount_percentage
  };
}

@Injectable({ providedIn: 'root' })
export class BusinessRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async get(businessId: string): Promise<BusinessSettings> {
    const { data, error } = await this.supabase
      .from('businesses')
      .select(SELECT_COLUMNS)
      .eq('id', businessId)
      .single();
    if (error) throw error;
    return mapRow(data as BusinessRow);
  }

  async update(businessId: string, input: BusinessSettingsFormValue): Promise<void> {
    const { error } = await this.supabase
      .from('businesses')
      .update({
        name: input.name,
        legal_name: input.legalName,
        tax_id: input.taxId,
        email: input.email,
        phone: input.phone,
        address: input.address,
        cash_discount_percentage: input.cashDiscountPercentage
      })
      .eq('id', businessId);
    if (error) throw error;
  }
}
