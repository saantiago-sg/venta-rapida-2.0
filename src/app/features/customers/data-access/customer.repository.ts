import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Customer, CustomerFormValue } from './models';

interface CustomerRow {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
}

const SELECT_COLUMNS = 'id, business_id, name, phone, email, document, address, notes, active';

function mapRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    document: row.document,
    address: row.address,
    notes: row.notes,
    active: row.active
  };
}

@Injectable({ providedIn: 'root' })
export class CustomerRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<Customer[]> {
    const { data, error } = await this.supabase
      .from('customers')
      .select(SELECT_COLUMNS)
      .eq('business_id', businessId)
      .order('name');
    if (error) throw error;
    return (data as CustomerRow[]).map(mapRow);
  }

  async create(businessId: string, input: CustomerFormValue): Promise<Customer> {
    const { data, error } = await this.supabase
      .from('customers')
      .insert({ business_id: businessId, ...input })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data as CustomerRow);
  }

  async update(id: string, input: CustomerFormValue): Promise<void> {
    const { error } = await this.supabase.from('customers').update(input).eq('id', id);
    if (error) throw error;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('customers').update({ active }).eq('id', id);
    if (error) throw error;
  }
}
