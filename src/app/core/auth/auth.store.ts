import { Injectable, computed, signal } from '@angular/core';

export type MembershipRole = 'owner' | 'admin' | 'cashier';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

export interface Membership {
  businessId: string;
  businessName: string;
  role: MembershipRole;
  /** Permisos granulares activados encima del preset del rol (ver Fase 4 del diseño). */
  permissions: string[];
  subscriptionStatus: SubscriptionStatus;
  subscriptionPaidUntil: string | null;
}

/**
 * Estado de sesión: usuario actual, negocios a los que pertenece (memberships N:N)
 * y cuál es el negocio activo. Un mismo usuario puede pertenecer a varios negocios.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _userId = signal<string | null>(null);
  private readonly _userEmail = signal<string | null>(null);
  private readonly _memberships = signal<Membership[]>([]);
  private readonly _activeBusinessId = signal<string | null>(null);
  private readonly _isSuperAdmin = signal(false);

  readonly userId = this._userId.asReadonly();
  readonly userEmail = this._userEmail.asReadonly();
  readonly memberships = this._memberships.asReadonly();
  readonly activeBusinessId = this._activeBusinessId.asReadonly();
  /** Acceso de plataforma (tabla `super_admins`), independiente de cualquier `business_id`. */
  readonly isSuperAdmin = this._isSuperAdmin.asReadonly();

  readonly isAuthenticated = computed(() => this._userId() !== null);

  readonly activeMembership = computed(
    () => this._memberships().find((m) => m.businessId === this._activeBusinessId()) ?? null
  );

  setSession(userId: string, memberships: Membership[], isSuperAdmin = false, userEmail: string | null = null): void {
    this._userId.set(userId);
    this._userEmail.set(userEmail);
    this._memberships.set(memberships);
    this._activeBusinessId.set(memberships[0]?.businessId ?? null);
    this._isSuperAdmin.set(isSuperAdmin);
  }

  clearSession(): void {
    this._userId.set(null);
    this._userEmail.set(null);
    this._memberships.set([]);
    this._activeBusinessId.set(null);
    this._isSuperAdmin.set(false);
  }

  setActiveBusiness(businessId: string): void {
    if (this._memberships().some((m) => m.businessId === businessId)) {
      this._activeBusinessId.set(businessId);
    }
  }

  /** El owner siempre tiene todos los permisos; para el resto se chequea el toggle puntual. */
  hasPermission(permission: string): boolean {
    const membership = this.activeMembership();
    if (!membership) return false;
    if (membership.role === 'owner') return true;
    return membership.permissions.includes(permission);
  }
}
