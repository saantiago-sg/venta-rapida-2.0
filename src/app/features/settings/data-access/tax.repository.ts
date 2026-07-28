import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Tax } from './models';

interface TaxRow {
  id: string;
  business_id: string;
  name: string;
  rate: number;
  active: boolean;
}

function mapRow(row: TaxRow): Tax {
  return { id: row.id, businessId: row.business_id, name: row.name, rate: row.rate, active: row.active };
}

@Injectable({ providedIn: 'root' })
export class TaxRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<Tax[]> {
    const { data, error } = await this.supabase
      .from('taxes')
      .select('id, business_id, name, rate, active')
      .eq('business_id', businessId)
      .order('name');
    if (error) throw error;
    return (data as TaxRow[]).map(mapRow);
  }

  async create(businessId: string, name: string, rate: number): Promise<Tax> {
    const { data, error } = await this.supabase
      .from('taxes')
      .insert({ business_id: businessId, name, rate })
      .select('id, business_id, name, rate, active')
      .single();
    if (error) throw error;
    return mapRow(data as TaxRow);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('taxes').update({ active }).eq('id', id);
    if (error) throw error;
  }
}
