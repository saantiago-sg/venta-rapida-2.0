import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

export interface AdminBusiness {
  id: string;
  name: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPaidUntil: string | null;
  active: boolean;
}

export interface CreateBusinessInput {
  businessName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName?: string;
}

export interface PlatformMetrics {
  totalBusinesses: number;
  activeBusinesses: number;
  totalUsers: number;
}

interface BusinessRow {
  id: string;
  name: string;
  subscription_status: SubscriptionStatus;
  subscription_paid_until: string | null;
  active: boolean;
}

function mapRow(row: BusinessRow): AdminBusiness {
  return {
    id: row.id,
    name: row.name,
    subscriptionStatus: row.subscription_status,
    subscriptionPaidUntil: row.subscription_paid_until,
    active: row.active
  };
}

@Injectable({ providedIn: 'root' })
export class BusinessAdminRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(): Promise<AdminBusiness[]> {
    const { data, error } = await this.supabase
      .from('businesses')
      .select('id, name, subscription_status, subscription_paid_until, active')
      .order('name');
    if (error) throw error;
    return (data as BusinessRow[]).map(mapRow);
  }

  async getMetrics(): Promise<PlatformMetrics> {
    const [totalResult, activeResult, usersResult] = await Promise.all([
      this.supabase.from('businesses').select('id', { count: 'exact', head: true }),
      this.supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('active', true),
      this.supabase.from('profiles').select('id', { count: 'exact', head: true })
    ]);

    if (totalResult.error) throw totalResult.error;
    if (activeResult.error) throw activeResult.error;
    if (usersResult.error) throw usersResult.error;

    return {
      totalBusinesses: totalResult.count ?? 0,
      activeBusinesses: activeResult.count ?? 0,
      totalUsers: usersResult.count ?? 0
    };
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

  // Igual que create: activar/dar de baja y cambiar el estado de suscripcion de un negocio
  // ajeno pasa por Edge Function + service role, nunca por un update directo del cliente.
  async setActive(businessId: string, active: boolean): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke('manage-business', {
      body: { businessId, active }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  }

  async setSubscriptionStatus(businessId: string, subscriptionStatus: SubscriptionStatus): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke('manage-business', {
      body: { businessId, subscriptionStatus }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  }
}
