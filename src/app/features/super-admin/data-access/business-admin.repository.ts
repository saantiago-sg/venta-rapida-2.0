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

export interface AdminUserBusiness {
  name: string;
  role: string;
}

export interface AdminUser {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  isSuperAdmin: boolean;
  businesses: AdminUserBusiness[];
}

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  memberships: { role: string; businesses: { name: string } | { name: string }[] | null }[] | null;
}

interface BusinessRow {
  id: string;
  name: string;
  subscription_status: SubscriptionStatus;
  subscription_paid_until: string | null;
  active: boolean;
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
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

  // is_super_admin() ya deja ver todos los profiles (y memberships) de la plataforma via RLS,
  // asi que esto es un select directo -- no hace falta pasar por una Edge Function como
  // create/setActive, que si necesitan tocar auth.users con la service role key.
  async getUsers(): Promise<AdminUser[]> {
    const [usersResult, superAdminsResult] = await Promise.all([
      this.supabase
        .from('profiles')
        .select('id, full_name, email, created_at, memberships(role, businesses(name))')
        .order('created_at', { ascending: false }),
      this.supabase.from('super_admins').select('user_id')
    ]);
    if (usersResult.error) throw usersResult.error;
    if (superAdminsResult.error) throw superAdminsResult.error;

    const superAdminIds = new Set((superAdminsResult.data as { user_id: string }[]).map((row) => row.user_id));

    return (usersResult.data as unknown as UserRow[]).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      createdAt: row.created_at,
      isSuperAdmin: superAdminIds.has(row.id),
      businesses: (row.memberships ?? [])
        .map((m) => ({ name: first(m.businesses)?.name ?? '', role: m.role }))
        .filter((b) => b.name)
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
