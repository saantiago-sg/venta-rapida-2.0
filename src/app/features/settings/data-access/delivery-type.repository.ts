import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { DeliveryType } from './models';

interface DeliveryTypeRow {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
}

function mapRow(row: DeliveryTypeRow): DeliveryType {
  return { id: row.id, businessId: row.business_id, name: row.name, active: row.active };
}

@Injectable({ providedIn: 'root' })
export class DeliveryTypeRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<DeliveryType[]> {
    const { data, error } = await this.supabase
      .from('delivery_types')
      .select('id, business_id, name, active')
      .eq('business_id', businessId)
      .order('name');
    if (error) throw error;
    return (data as DeliveryTypeRow[]).map(mapRow);
  }

  async create(businessId: string, name: string): Promise<DeliveryType> {
    const { data, error } = await this.supabase
      .from('delivery_types')
      .insert({ business_id: businessId, name })
      .select('id, business_id, name, active')
      .single();
    if (error) throw error;
    return mapRow(data as DeliveryTypeRow);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('delivery_types').update({ active }).eq('id', id);
    if (error) throw error;
  }
}
