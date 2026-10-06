import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { clearProductCache } from '../../features/products/data-access/product-cache';
import { clearLocalCaches } from '../offline/local-cache';
import { isNetworkError } from '../offline/network-error';
import { SupabaseClientService } from '../supabase/supabase-client.service';
import { AuthStore, Membership, MembershipRole, SubscriptionStatus } from './auth.store';
import { readSessionSnapshot, storedSupabaseUserId, writeSessionSnapshot } from './session-snapshot';

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
  private readonly router = inject(Router);

  constructor() {
    // Cualquier cambio de sesion (login, revalidacion, cambio de negocio desde el Shell) queda
    // en la copia local -- asi la proxima apertura arranca tal cual quedo, incluido el negocio
    // que estaba elegido. signOut() la borra; con userId en null no se escribe nada.
    effect(() => {
      const userId = this.authStore.userId();
      if (!userId) return;
      writeSessionSnapshot({
        userId,
        userEmail: this.authStore.userEmail(),
        memberships: this.authStore.memberships(),
        isSuperAdmin: this.authStore.isSuperAdmin(),
        activeBusinessId: this.authStore.activeBusinessId()
      });
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.loadSession(data.user.id, data.user.email ?? null);
  }

  // Restaura la sesion al arrancar la app (corre como app initializer, antes de los guards).
  //
  // Camino rapido: si hay copia local de la sesion (ver session-snapshot.ts) y supabase-js
  // sigue teniendo guardado el token de ese mismo usuario, se entra al instante con la copia
  // y se revalida contra Supabase en segundo plano. Antes, cada apertura esperaba el refresh
  // del token + memberships + super_admins antes de mostrar nada, y sin conexion fallaba y
  // dejaba la app trabada en el splash.
  //
  // Camino de siempre (primera apertura despues de esta version, o sin copia): se espera la
  // red como antes. Nunca tira: si falla, la app arranca sin sesion (login) en vez de quedar
  // colgada en el splash.
  async restoreSession(): Promise<void> {
    const snapshot = readSessionSnapshot();
    if (snapshot && storedSupabaseUserId() === snapshot.userId) {
      this.authStore.setSession(
        snapshot.userId,
        snapshot.memberships,
        snapshot.isSuperAdmin,
        snapshot.userEmail,
        snapshot.activeBusinessId
      );
      void this.revalidateSession();
      return;
    }

    try {
      const { data } = await this.supabase.auth.getSession();
      if (data.session?.user) {
        await this.loadSession(data.session.user.id, data.session.user.email ?? null);
      }
    } catch {
      this.authStore.clearSession();
    }
  }

  // No borra la cola de ventas pendientes (IndexedDB, ver OfflineQueueService) -- esas ventas
  // ya se cobraron y tienen que llegar al servidor igual. El aviso de "hay ventas sin
  // sincronizar" lo da quien llama (ver Shell.onLogout).
  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.authStore.clearSession();
    clearLocalCaches();
    await clearProductCache();
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

  // Corre en segundo plano despues de arrancar con la copia local. Tres resultados posibles:
  // - Sin conexion: no se toca nada, se sigue con la copia (modo offline).
  // - La sesion ya no es valida (se cerro en otro lado, refresh token revocado): al login.
  // - OK: se pisan memberships/permisos/suscripcion con lo vigente, sin cambiar de negocio si
  //   el usuario sigue perteneciendo al activo (ver AuthStore.setSession).
  private async revalidateSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error && (isAuthRetryableFetchError(error) || isNetworkError(error))) return;

    const user = data.session?.user;
    if (!user) {
      this.authStore.clearSession();
      clearLocalCaches();
      await clearProductCache();
      await this.router.navigateByUrl('/login');
      return;
    }

    try {
      await this.loadSession(user.id, user.email ?? null);
    } catch {
      // Error de red (o puntual) trayendo memberships: se sigue con la copia local, que es lo
      // ultimo conocido. La proxima apertura vuelve a intentar.
    }
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

    this.authStore.setSession(
      userId,
      memberships,
      !!superAdminResult.data,
      userEmail,
      this.authStore.activeBusinessId()
    );
  }
}
