import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Category } from './models';

interface CategoryRow {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
}

function mapRow(row: CategoryRow): Category {
  return { id: row.id, businessId: row.business_id, name: row.name, active: row.active };
}

@Injectable({ providedIn: 'root' })
export class CategoryRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('categories')
      .select('id, business_id, name, active')
      .eq('business_id', businessId)
      .order('name');
    if (error) throw error;
    return (data as CategoryRow[]).map(mapRow);
  }

  async create(businessId: string, name: string): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .insert({ business_id: businessId, name })
      .select('id, business_id, name, active')
      .single();
    if (error) throw error;
    return mapRow(data as CategoryRow);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('categories').update({ active }).eq('id', id);
    if (error) throw error;
  }
}
