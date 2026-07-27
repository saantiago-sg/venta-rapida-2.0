import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';

export interface AdminBusiness {
  id: string;
  name: string;
  subscriptionStatus: string;
  active: boolean;
}

export interface CreateBusinessInput {
  businessName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName?: string;
}

interface BusinessRow {
  id: string;
  name: string;
  subscription_status: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class BusinessAdminRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(): Promise<AdminBusiness[]> {
    const { data, error } = await this.supabase
      .from('businesses')
      .select('id, name, subscription_status, active')
      .order('name');
    if (error) throw error;
    return (data as BusinessRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      subscriptionStatus: row.subscription_status,
      active: row.active
    }));
  }

  // Pasa por la Edge Function create-business (service role) porque crear un negocio
  // implica dar de alta un auth.users nuevo — algo que el cliente nunca puede hacer
  // con la anon key, ver mitigacion de seguridad de la Fase 1.
  async create(input: CreateBusinessInput): Promise<{ business: { id: string; name: string } }> {
    const { data, error } = await this.supabase.functions.invoke('create-business', { body: input });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }
}
