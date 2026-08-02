import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Employee, EmployeeRole, InviteEmployeeInput } from './models';

interface MembershipRow {
  id: string;
  user_id: string;
  role: EmployeeRole;
  permissions: string[];
  active: boolean;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapRow(row: MembershipRow): Employee {
  const profile = first(row.profiles);
  return {
    membershipId: row.id,
    userId: row.user_id,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? null,
    role: row.role,
    permissions: row.permissions ?? [],
    active: row.active
  };
}

@Injectable({ providedIn: 'root' })
export class EmployeeRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<Employee[]> {
    const { data, error } = await this.supabase
      .from('memberships')
      .select('id, user_id, role, permissions, active, profiles!memberships_user_id_fkey(full_name, email)')
      .eq('business_id', businessId)
      .order('role');
    if (error) throw error;
    return (data as unknown as MembershipRow[]).map(mapRow);
  }

  async invite(businessId: string, input: InviteEmployeeInput): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke('invite-employee', {
      body: {
        businessId,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        permissions: input.permissions,
        password: input.password
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  }

  async updateRole(membershipId: string, role: 'admin' | 'cashier'): Promise<void> {
    const { error } = await this.supabase.from('memberships').update({ role }).eq('id', membershipId);
    if (error) throw error;
  }

  async updatePermissions(membershipId: string, permissions: string[]): Promise<void> {
    const { error } = await this.supabase.from('memberships').update({ permissions }).eq('id', membershipId);
    if (error) throw error;
  }

  async setActive(membershipId: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('memberships').update({ active }).eq('id', membershipId);
    if (error) throw error;
  }
}
