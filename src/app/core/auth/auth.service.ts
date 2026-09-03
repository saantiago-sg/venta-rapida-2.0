import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../supabase/supabase-client.service';
import { AuthStore, Membership, MembershipRole, SubscriptionStatus } from './auth.store';

interface MembershipRow {
  business_id: string;
  role: MembershipRole;
  permissions: string[];
  businesses: BusinessRow | BusinessRow[] | null;
}

interface BusinessRow {
  name: string;
  subscription_status: SubscriptionStatus;
  subscription_paid_until: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly authStore = inject(AuthStore);

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.loadSession(data.user.id, data.user.email ?? null);
  }

  // Restaura la sesion desde el token persistido por supabase-js (localStorage) al arrancar
  // la app — sin esto, refrescar la pagina (F5) tira al usuario al login aunque su JWT siga valido.
  async restoreSession(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    if (data.session?.user) {
      await this.loadSession(data.session.user.id, data.session.user.email ?? null);
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.authStore.clearSession();
  }

  // Supabase no distingue "email no existe" de "se mando el link" en la respuesta -- no hay
  // nada que revisar del error aca a proposito, ver ForgotPasswordPage (siempre muestra el
  // mismo mensaje generico, para no filtrar por timing/resultado si un email esta registrado).
  async requestPasswordReset(email: string): Promise<void> {
    await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-contrasena`
    });
  }

  // Se usa con la sesion de recuperacion que supabase-js arma solo al abrir el link del mail
  // (detectSessionInUrl) -- ver ResetPasswordPage.
  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async hasActiveSession(): Promise<boolean> {
    const { data } = await this.supabase.auth.getSession();
    return !!data.session;
  }

  private async loadSession(userId: string, userEmail: string | null): Promise<void> {
    const [membershipsResult, superAdminResult] = await Promise.all([
      this.supabase
        .from('memberships')
        .select('business_id, role, permissions, businesses(name, subscription_status, subscription_paid_until)')
        .eq('user_id', userId)
        .eq('active', true),
      this.supabase.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle()
    ]);

    if (membershipsResult.error) throw membershipsResult.error;

    const memberships: Membership[] = (membershipsResult.data as unknown as MembershipRow[]).map((row) => {
      const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
      return {
        businessId: row.business_id,
        businessName: business?.name ?? '',
        role: row.role,
        permissions: row.permissions ?? [],
        subscriptionStatus: business?.subscription_status ?? 'trial',
        subscriptionPaidUntil: business?.subscription_paid_until ?? null
      };
    });

    this.authStore.setSession(userId, memberships, !!superAdminResult.data, userEmail);
  }
}
